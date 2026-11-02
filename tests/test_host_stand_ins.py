"""The backend on a gateway that has none of the host names it uses.

``conftest.py`` blocks ``kiro_crew``, so ``backend/_host.py`` resolved every name
to its stand-in at import; these tests keep those stand-ins (``bare_host``) and
check each one refuses rather than widening access, and that ``/health`` names
what is missing.
"""

from __future__ import annotations

import io
import json
import os

import pytest

from backend import _host, server

pytestmark = pytest.mark.usefixtures("bare_host")

if os.environ.get("KIROCREW_SRC"):  # pragma: no cover - the real-host run
    pytest.skip("the real host is imported; there are no stand-ins", allow_module_level=True)

EVERY_GAP = [
    "proxy_auth",
    "sensitive_path",
    "safe_read",
    "redaction",
    "context_redaction",
    "credential_scan",
    "audit_log",
    "nvm_layout",
    "platform_paths",
    "platform_process",
]


def test_every_missing_name_is_reported():
    assert _host.HOST_GAPS == EVERY_GAP
    assert server.HOST_GAPS is _host.HOST_GAPS


def test_the_proxy_signature_is_never_accepted():
    assert _host.verify_proxy_request("sig", method="GET", target="/queue", body=b"") is False


def test_every_path_is_sensitive(tmp_path):
    assert _host.is_sensitive_path(str(tmp_path / "index.html")) is True
    assert _host.path_contains_sensitive(str(tmp_path)) is True


def test_every_read_is_refused(tmp_path):
    page = tmp_path / "index.html"
    page.write_text("<h1>hi</h1>", encoding="utf-8")
    assert _host.safe_read_file_bytes_nolink(str(page), within_root=str(tmp_path)) is None


def test_text_is_withheld_not_shown_unredacted():
    secret = "AKIA" + "IOSFODNN7EXAMPLE"
    for redact in (_host.redact_credentials, _host.redact_exfiltration_urls):
        text, found = redact(f"key {secret}")
        assert secret not in text and text == _host.WITHHELD and found
        assert redact("") == ("", [])
    assert _host.redact_via_context(f"key {secret}") == _host.WITHHELD
    assert server._redact_text(f"note {secret}") == _host.WITHHELD


def test_every_text_file_reads_as_carrying_a_credential():
    assert server._contains_credential(b"<h1>plain page</h1>") is True
    assert server._contains_credential(b"") is False
    # Binary content still has no text to scan.
    assert server._contains_credential(b"\x89PNG\r\n\x1a\n\xff\xfe") is False


def test_no_listener_is_claimed_and_no_process_is_ours():
    assert _host.find_port_listeners(5173) == []
    assert _host.address_covers_loopback("127.0.0.1") is False
    assert _host.get_ppid(1234) == 0
    assert _host.trusted_system_bin("lsof") is None
    assert _host.nvm_version_bin_dirs() == ()


def test_the_strip_of_the_extended_length_prefix_is_the_hosts_rule():
    strip = _host.strip_extended_length_prefix
    assert strip("\\\\?\\C:\\proj") == "C:\\proj"
    assert strip("\\\\?\\UNC\\host\\share") == "\\\\host\\share"
    assert strip("/home/u/proj") == "/home/u/proj"


class _Probe(server.Handler):
    """A socketless handler: no ``BaseHTTPRequestHandler.__init__``."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.headers = {}
        self.rfile = io.BytesIO(b"")
        self.sent: list[tuple[int, dict]] = []

    def _json(self, code, payload):
        self.sent.append((code, payload))


def test_health_answers_and_names_the_gaps(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "QUEUE_DIR", tmp_path / "queue")
    probe = _Probe("/health")
    probe.do_GET()
    code, payload = probe.sent[0]
    assert code == 200
    assert payload["app"] == "design-tweak"
    assert payload["hostGaps"] == EVERY_GAP


def test_a_signed_route_answers_401_without_the_proxy_check():
    probe = _Probe("/queue")
    probe.do_GET()
    code, payload = probe.sent[0]
    assert code == 401
    assert payload["code"] == "invalid_proxy_signature"
    json.dumps(payload)
