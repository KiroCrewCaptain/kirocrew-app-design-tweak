"""The backend the way the gateway starts it: ``python backend/server.py``.

The gateway runs a file entry point as a script with the app root as its working
directory (``apps/backend.py``, the plain-Python branch), not as the ``backend``
package the other tests import. This starts it that way, on a loopback port, and
checks it serves ``/health`` and refuses an unsigned request. The ``-I -S`` form
also proves it starts with neither its own directory nor any site-packages on
``sys.path`` (so with no ``kiro_crew`` at all).
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def _get(port: int, path: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


@pytest.mark.parametrize("flags", [["-s"], ["-I", "-S"]], ids=["gateway-form", "isolated"])
def test_the_script_serves_health_and_refuses_unsigned(tmp_path, flags):
    port = _free_port()
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("KIROCREW_", "PYTHON"))
    }
    env.update(
        PORT=str(port),
        KIROCREW_APP_NAME="design-tweak",
        KIROCREW_APP_DATA_DIR=str(tmp_path / "data"),
        KIROCREW_HOME=str(tmp_path / "home"),
    )
    proc = subprocess.Popen(
        [sys.executable, *flags, str(APP_ROOT / "backend" / "server.py")],
        cwd=str(APP_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        deadline = time.monotonic() + 30
        health = None
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                out = proc.stdout.read().decode("utf-8", "replace") if proc.stdout else ""
                pytest.fail(f"backend exited with {proc.returncode}: {out}")
            try:
                health = _get(port, "/health")
                break
            except (urllib.error.URLError, ConnectionError, OSError):
                time.sleep(0.1)
        assert health is not None, "the backend never answered /health"
        code, payload = health
        assert code == 200
        assert payload["status"] == "ok"
        assert payload["app"] == "design-tweak"
        assert isinstance(payload["hostGaps"], list)
        if "-S" in flags:
            assert "proxy_auth" in payload["hostGaps"]
        assert Path(payload["dataDir"]) == (tmp_path / "data").resolve()
        code, payload = _get(port, "/queue")
        assert code == 401
        assert payload["code"] == "invalid_proxy_signature"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
        if proc.stdout:
            proc.stdout.close()
