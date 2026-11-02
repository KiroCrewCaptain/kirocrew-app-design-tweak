"""A stand-in for the gateway half the backend reaches through ``backend/_host.py``.

The tests run with no Kiro Crew (``conftest.py`` blocks the package, so an
installed copy on the machine cannot change a result). Each test then gets this
double installed over the host names on ``backend.server``, so the app's own
logic is exercised against the host behaviour it was written for. Each stand-in
restates the rule the app relies on, narrowly:

- the credential fence: a path is sensitive when it is (or sits under) one of the
  home credential dot-dirs or a credential file; a directory "contains" one when
  a credential dot-dir sits under it;
- the link-safe read: a regular, singly linked, non-link file inside its root,
  read up to ``max_bytes`` (larger raises ``FileTooLargeError``);
- the redaction floor: the credential shapes the tests use (an AWS access key id,
  an Anthropic or OpenAI key, a GitHub or Slack token, a labelled secret, a PEM
  private key), each rewritten to ``[REDACTED: credential]``; a URL whose query or
  path carries one is rewritten to ``[REDACTED: suspicious URL to <host>]``;
- the context redaction is the baseline floor (no companion loaded);
- the listener and process helpers have the host's shapes; the tests that care
  replace them;
- ``trusted_system_bin`` looks only in the fixed system directories.

``tests/test_host_stand_ins.py`` checks the real stand-ins in ``backend/_host.py``
refuse; ``KIROCREW_SRC`` runs the whole suite against the real host instead
(``conftest.py``).
"""

from __future__ import annotations

import os
import re
import stat
from pathlib import Path
from typing import Any, Iterator, NamedTuple

import pytest

DENIED_ROOT_PARTS = frozenset({".ssh", ".aws", ".gnupg", ".kube", ".docker"})
_CREDENTIAL_FILES = frozenset({".netrc", ".git-credentials", ".pypirc"})


class PortListener(NamedTuple):
    pid: int
    address: str
    family: str = ""


class FileTooLargeError(Exception):
    pass


# --- credential fence -------------------------------------------------------------


def _home() -> str:
    return os.path.realpath(os.path.expanduser("~"))


def _within(child: str, parent: str) -> bool:
    child, parent = os.path.normcase(child), os.path.normcase(parent)
    return child == parent or child.startswith(parent.rstrip(os.sep) + os.sep)


def is_sensitive_path(path_str: str, base_dir: str | None = None) -> bool:
    try:
        real = os.path.realpath(os.path.join(base_dir or "", os.path.expanduser(str(path_str))))
    except (OSError, ValueError):
        return True
    home = _home()
    for part in DENIED_ROOT_PARTS:
        if _within(real, os.path.join(home, part)):
            return True
    return Path(real).name in _CREDENTIAL_FILES


def path_contains_sensitive(
    dir_str: str, base_dir: str | None = None, *, pre_resolved: bool = False
) -> bool:
    try:
        real = dir_str if pre_resolved else os.path.realpath(str(dir_str))
    except (OSError, ValueError):
        return True
    if is_sensitive_path(real):
        return True
    home = _home()
    return any(_within(os.path.join(home, part), real) for part in DENIED_ROOT_PARTS)


def safe_read_file_bytes_nolink(
    raw: str,
    within_root: str | None = None,
    *,
    max_bytes: int | None = None,
    allow_truncate: bool = False,
    **_kwargs: Any,
) -> bytes | None:
    path = os.path.abspath(str(raw))
    if is_sensitive_path(path):
        return None
    try:
        st = os.lstat(path)
    except OSError:
        return None
    if not stat.S_ISREG(st.st_mode) or st.st_nlink > 1:
        return None
    if within_root is not None:
        if not _within(os.path.realpath(path), os.path.realpath(within_root)):
            return None
    try:
        with open(path, "rb") as handle:
            data = handle.read() if max_bytes is None else handle.read(max_bytes + 1)
    except OSError:
        return None
    if max_bytes is not None and len(data) > max_bytes:
        if allow_truncate:
            return data[:max_bytes]
        raise FileTooLargeError(path)
    return data


# --- redaction floor ----------------------------------------------------------------

_PEM = r"-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)?"
_CREDENTIAL = re.compile(
    "|".join(
        (
            _PEM,
            r"\bAKIA[0-9A-Z]{16}\b",
            r"\bsk-ant-[A-Za-z0-9_-]{8,}",
            r"\bsk-[A-Za-z0-9]{20,}",
            r"\bgh[pousr]_[A-Za-z0-9]{20,}",
            r"\bxox[abprs]-[A-Za-z0-9-]+",
            r"(?i:\b(?:aws_secret_access_key|password|secret|api[_-]?key)\s*[=:]\s*\S+)",
        )
    )
)
_URL = re.compile(r"https?://([A-Za-z0-9.-]+)(?::\d+)?[^\s\"'<>]*")
_LOOPBACK = frozenset({"localhost", "127.0.0.1"})


def _credential_matches(text: str) -> Iterator[re.Match[str]]:
    return _CREDENTIAL.finditer(text)


def redact_credentials(text: str, **_kwargs: Any) -> tuple[str, list[str]]:
    found: list[str] = []

    def sub(_match: re.Match[str]) -> str:
        found.append("credential")
        return "[REDACTED: credential]"

    return _CREDENTIAL.sub(sub, text), found


def redact_exfiltration_urls(text: str, **_kwargs: Any) -> tuple[str, list[str]]:
    found: list[str] = []

    def sub(match: re.Match[str]) -> str:
        host = match.group(1).lower()
        if host in _LOOPBACK or not _CREDENTIAL.search(match.group(0)):
            return match.group(0)
        found.append(host)
        return f"[REDACTED: suspicious URL to {host}]"

    return _URL.sub(sub, text), found


def redact_via_context(text: str) -> str:
    text, _ = redact_exfiltration_urls(text)
    text, _ = redact_credentials(text)
    return text


# --- platform helpers ----------------------------------------------------------------------

_LOOPBACK_COVERING = frozenset({"127.0.0.1", "::ffff:127.0.0.1", "0.0.0.0", "::", "*"})


def address_covers_loopback(address: str) -> bool:
    return address.strip("[]").lower() in _LOOPBACK_COVERING


def find_port_listeners(port: int) -> list[PortListener]:
    return []


def get_ppid(pid: int) -> int:
    return 0


_SYSTEM_BIN_DIRS = ("/usr/bin", "/bin", "/usr/sbin", "/sbin")


def trusted_system_bin(name: str) -> str | None:
    if os.name != "posix":
        return None
    for directory in _SYSTEM_BIN_DIRS:
        candidate = os.path.join(directory, name)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def nvm_version_bin_dirs() -> tuple[str, ...]:
    """Every ``<nvm root>/versions/node/<v>/bin``, newest version first."""
    roots = []
    if os.environ.get("NVM_DIR"):
        roots.append(Path(os.environ["NVM_DIR"]))
    roots.append(Path(os.path.expanduser("~")) / ".nvm")
    xdg = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    roots.append(Path(xdg) / "nvm")
    found: list[str] = []
    for root in roots:
        versions = root / "versions" / "node"
        try:
            entries = [entry for entry in versions.iterdir() if (entry / "bin").is_dir()]
        except OSError:
            continue

        def key(entry: Path) -> tuple[int, ...]:
            return tuple(int(n) for n in re.findall(r"\d+", entry.name)[:3])

        for entry in sorted(entries, key=key, reverse=True):
            bin_dir = str(entry / "bin")
            if bin_dir not in found:
                found.append(bin_dir)
    return tuple(found)


_NAMES = (
    "FileTooLargeError",
    "_credential_matches",
    "address_covers_loopback",
    "find_port_listeners",
    "get_ppid",
    "is_sensitive_path",
    "nvm_version_bin_dirs",
    "path_contains_sensitive",
    "redact_credentials",
    "redact_exfiltration_urls",
    "redact_via_context",
    "safe_read_file_bytes_nolink",
    "trusted_system_bin",
)


def install(monkeypatch: pytest.MonkeyPatch) -> None:
    """Put the double over the stand-ins on ``backend.server`` (and ``backend._host``)."""
    from backend import _host, server

    for name in _NAMES:
        value = globals()[name]
        monkeypatch.setattr(_host, name, value)
        monkeypatch.setattr(server, name, value)
    # server keeps a second binding for the nvm layout.
    monkeypatch.setattr(server, "_nvm_version_bin_dirs", nvm_version_bin_dirs)
    monkeypatch.setattr(server, "HOST_GAPS", [])
