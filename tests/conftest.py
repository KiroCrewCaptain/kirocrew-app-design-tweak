"""Test session setup: the app root on ``sys.path``, and which host the backend sees.

By default ``kiro_crew`` is blocked before the backend is imported, so
``backend/_host.py`` resolves every host name to its refusing stand-in, exactly as
on a gateway that lacks them, whether or not a Kiro Crew happens to be installed
on the machine. The autouse ``host`` fixture then installs ``tests/host_double.py``
over those stand-ins for each test, so the app's own logic runs against the host
behaviour it was written for. A test that wants the bare stand-ins asks for
``bare_host``.

With ``KIROCREW_SRC`` set to a Kiro Crew checkout's ``src`` directory (and that
checkout's dependencies installed), the real host is imported instead and no
double is installed: the same suite then runs against the gateway's own code.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

REAL_HOST = bool(os.environ.get("KIROCREW_SRC"))
if REAL_HOST:
    sys.path.insert(1, os.environ["KIROCREW_SRC"])
else:
    # A None entry makes every `import kiro_crew...` raise ImportError.
    sys.modules["kiro_crew"] = None  # type: ignore[assignment]


@pytest.fixture
def bare_host() -> None:
    """Keep the stand-ins: the backend as it runs on a gateway with no host names."""


@pytest.fixture(autouse=True)
def host(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    if REAL_HOST or "bare_host" in request.fixturenames:
        return
    from tests import host_double

    host_double.install(monkeypatch)
