"""Host bridge: every place this backend reaches into Kiro Crew, in one module.

The gateway spawns ``backend/server.py`` under its own interpreter (this app has
no ``requirements.txt``, so no app venv is made), so the ``kiro_crew`` package is
importable here. It is imported only for what must be the HOST's own rather than
a copy, because a copy would drift from the policy every other Kiro Crew surface
enforces:

- ``verify_proxy_request``: the documented App Kit proxy signature check.
- the credential fence (``is_sensitive_path``, ``path_contains_sensitive``,
  ``DENIED_ROOT_PARTS``) and the link-safe read (``safe_read_file_bytes_nolink``).
- the redaction floor (``redact_credentials``, ``redact_exfiltration_urls``,
  ``redact_via_context``) and the credential scanner behind the static server's
  refusal to serve a file that carries a key (``_credential_matches``).
- the security event log (``sel``).
- the platform helpers that enumerate listeners, walk a process tree and kill
  one (``kiro_crew.platform_compat``), and the nvm install layout
  (``nvm_version_bin_dirs``).

Each import is feature-detected, and a missing one never widens access: without
the proxy check every route but ``/health`` answers 401; without the credential
fence every path is sensitive; without the safe read every read is refused;
without the redaction floor a text is withheld rather than shown unredacted;
without the credential scanner every text file reads as carrying one; without
the listener, process-tree or trusted-binary helpers no foreign server is
adopted, no process is claimed as ours and no system tool is run. ``HOST_GAPS``
names what is missing; ``/health`` reports it so the operator sees why.

Nothing else in ``backend/`` imports ``kiro_crew`` (``tests/test_no_host_imports.py``).
"""

from __future__ import annotations

import logging
import os
import re
import signal
import subprocess
import sys
from typing import Any, Iterator, NamedTuple

HOST_GAPS: list[str] = []

# Withheld in place of a text the host could not redact. Never the text itself.
WITHHELD = "[withheld: the host redaction floor is not available to this app]"


def _gap(name: str) -> None:
    if name not in HOST_GAPS:
        HOST_GAPS.append(name)


# --- proxy signature (public App Kit surface) ---------------------------------

try:
    from kiro_crew.apps.proxy_auth import verify_proxy_request
except Exception:  # noqa: BLE001 -- any failure to import is "absent"
    _gap("proxy_auth")

    def verify_proxy_request(header_value: str, **_kwargs: Any) -> bool:  # type: ignore[misc]
        return False


# --- credential fence ----------------------------------------------------------

try:
    from kiro_crew.security import (
        DENIED_ROOT_PARTS,
        is_sensitive_path,
        path_contains_sensitive,
    )
except Exception:  # noqa: BLE001
    _gap("sensitive_path")
    # The host's credential dot-dir set at the commit this was ported from. Only
    # the static server's project-secret list reads it here; the fence itself is
    # the two refusing stand-ins below.
    DENIED_ROOT_PARTS = frozenset({".ssh", ".aws", ".gnupg", ".kube", ".docker"})

    def is_sensitive_path(path_str: str, base_dir: str | None = None) -> bool:  # type: ignore[misc]
        return True

    def path_contains_sensitive(  # type: ignore[misc]
        dir_str: str, base_dir: str | None = None, *, pre_resolved: bool = False
    ) -> bool:
        return True


try:
    from kiro_crew.hooks import FileTooLargeError, safe_read_file_bytes_nolink
except Exception:  # noqa: BLE001
    _gap("safe_read")

    class FileTooLargeError(Exception):  # type: ignore[no-redef]
        """Stands in for the host's oversize-read refusal."""

    def safe_read_file_bytes_nolink(raw: str, *_args: Any, **_kwargs: Any) -> bytes | None:  # type: ignore[misc]
        return None


# --- redaction floor -----------------------------------------------------------

try:
    from kiro_crew.security import redact_credentials, redact_exfiltration_urls
except Exception:  # noqa: BLE001
    _gap("redaction")

    def redact_credentials(text: str, **_kwargs: Any) -> tuple[str, list[str]]:  # type: ignore[misc]
        return (WITHHELD, ["withheld"]) if text else (text, [])

    def redact_exfiltration_urls(text: str, **_kwargs: Any) -> tuple[str, list[str]]:  # type: ignore[misc]
        return (WITHHELD, ["withheld"]) if text else (text, [])


try:
    from kiro_crew.platform.context import redact_via_context
except Exception:  # noqa: BLE001
    _gap("context_redaction")

    def redact_via_context(text: str) -> str:  # type: ignore[misc]
        return WITHHELD if text else text


try:
    from kiro_crew.security.redaction_patterns import _credential_matches
except Exception:  # noqa: BLE001
    try:
        # Where the scanner lived before it moved beside the pattern table.
        from kiro_crew.security.redaction import _credential_matches
    except Exception:  # noqa: BLE001
        _gap("credential_scan")
        _EVERYTHING = re.compile(r"[\s\S]+")

        def _credential_matches(text: str) -> Iterator[re.Match[str]]:  # type: ignore[misc]
            # Every non-empty text reads as one credential, so nothing textual
            # is served without the host's scanner.
            return _EVERYTHING.finditer(text[:1] if text else "")


# --- security event log ---------------------------------------------------------

try:
    from kiro_crew.sel import sel
except Exception:  # noqa: BLE001
    _gap("audit_log")

    class _LocalAudit:
        def log_api_access(self, **fields: object) -> None:
            logging.getLogger("design-tweak.audit").info("audit %s", fields)

    _LOCAL_AUDIT = _LocalAudit()

    def sel() -> _LocalAudit:  # type: ignore[misc]
        return _LOCAL_AUDIT


# --- node install layout ---------------------------------------------------------

try:
    from kiro_crew.env import nvm_version_bin_dirs
except Exception:  # noqa: BLE001
    _gap("nvm_layout")

    def nvm_version_bin_dirs() -> tuple[str, ...]:  # type: ignore[misc]
        return ()


# --- subprocess text mode ----------------------------------------------------------
#
# Stated here, not imported: it is three keyword arguments, and the host's own
# ``kiro_crew.subprocess_utf8.UTF8_TEXT`` is the same mapping.
UTF8_TEXT: dict[str, Any] = {"text": True, "encoding": "utf-8", "errors": "replace"}


# --- platform helpers ----------------------------------------------------------------


class PortListener(NamedTuple):
    """The host's listener record: owning pid, bound address, address family."""

    pid: int
    address: str
    family: str = ""


def _local_strip_extended_length_prefix(path: Any) -> Any:
    text = str(path)
    if text.startswith("\\\\?\\UNC\\"):
        return type(path)("\\\\" + text[8:])
    if text.startswith("\\\\?\\"):
        return type(path)(text[4:])
    return path


try:
    from kiro_crew.platform_compat import strip_extended_length_prefix
except Exception:  # noqa: BLE001
    _gap("platform_paths")
    strip_extended_length_prefix = _local_strip_extended_length_prefix


try:
    from kiro_crew.platform_compat import (
        CREATE_NEW_PROCESS_GROUP,
        IS_MACOS,
        IS_POSIX,
        SIGKILL,
        SIGTERM,
        address_covers_loopback,
        find_port_listeners,
        get_ppid,
        is_link_or_junction,
        kill_process_tree,
        trusted_system_bin,
    )
except Exception:  # noqa: BLE001
    _gap("platform_process")
    IS_POSIX = os.name == "posix"
    IS_MACOS = sys.platform == "darwin"
    SIGTERM = int(signal.SIGTERM)
    SIGKILL = int(getattr(signal, "SIGKILL", signal.SIGTERM))
    CREATE_NEW_PROCESS_GROUP = int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))

    def address_covers_loopback(address: str) -> bool:  # type: ignore[misc]
        # Claim no listener: a foreign server is then never adopted.
        return False

    def find_port_listeners(port: int) -> list[PortListener]:  # type: ignore[misc]
        return []

    def get_ppid(pid: int) -> int:  # type: ignore[misc]
        # 0 is the host's "no parent known": a process is then never ours.
        return 0

    def is_link_or_junction(path: Any) -> bool:  # type: ignore[misc]
        if os.path.islink(path):
            return True
        isjunction = getattr(os.path, "isjunction", None)
        try:
            return bool(isjunction(path)) if isjunction else False
        except (OSError, ValueError):
            return False

    def trusted_system_bin(name: str) -> str | None:  # type: ignore[misc]
        return None

    def kill_process_tree(pid: int, sig: int = SIGTERM) -> bool:  # type: ignore[misc]
        """Stop a dev server this backend started in its own session or group."""
        if pid <= 0:
            return False
        if IS_POSIX:
            try:
                # The child was started with start_new_session, so its group id is its pid.
                os.killpg(pid, sig)
                return True
            except (ProcessLookupError, PermissionError, OSError):
                return False
        taskkill = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"), "System32", "taskkill.exe"
        )
        try:
            result = subprocess.run(
                [taskkill, "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                timeout=10,
                **UTF8_TEXT,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return result.returncode == 0


__all__ = [
    "CREATE_NEW_PROCESS_GROUP",
    "DENIED_ROOT_PARTS",
    "FileTooLargeError",
    "HOST_GAPS",
    "IS_MACOS",
    "IS_POSIX",
    "SIGKILL",
    "SIGTERM",
    "UTF8_TEXT",
    "WITHHELD",
    "address_covers_loopback",
    "find_port_listeners",
    "get_ppid",
    "is_link_or_junction",
    "is_sensitive_path",
    "kill_process_tree",
    "nvm_version_bin_dirs",
    "path_contains_sensitive",
    "redact_credentials",
    "redact_exfiltration_urls",
    "redact_via_context",
    "safe_read_file_bytes_nolink",
    "sel",
    "strip_extended_length_prefix",
    "trusted_system_bin",
    "verify_proxy_request",
    "_credential_matches",
]
