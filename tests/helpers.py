"""Small test helpers the Kiro Crew suite provided to these tests.

``wait_until`` is the bounded poll of ``kiro_crew.testing.wait`` (the same
contract: read at least once and once more at the deadline, raise naming the
state, never return falsy). ``requires_symlinks`` skips where a symlink cannot be
made (Windows without the privilege).
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import Callable, TypeVar

import pytest

_T = TypeVar("_T")

# Captured at import, so a test that fakes the clock does not move this deadline.
_monotonic = time.monotonic
_sleep = time.sleep


def wait_until(
    predicate: Callable[[], _T],
    *,
    timeout: float = 30.0,
    interval: float = 0.01,
    describe: Callable[[], object] = lambda: "",
    ignoring: tuple[type[Exception], ...] = (),
) -> _T:
    """Poll ``predicate`` until it returns a truthy value, and return it."""
    start = _monotonic()
    deadline = start + timeout
    polls = 0
    cause: Exception | None = None
    while True:
        polls += 1
        try:
            value = predicate()
        except ignoring as exc:
            cause = exc
        else:
            if value:
                return value
        if _monotonic() >= deadline:
            raise AssertionError(
                f"wait_until: {getattr(predicate, '__name__', predicate)!r} not true after "
                f"{_monotonic() - start:.2f}s ({polls} polls); state: {describe()!r}"
            ) from cause
        _sleep(interval)


def _can_create_symlink() -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            os.symlink(os.path.join(tmp, "target"), os.path.join(tmp, "link"))
        except (OSError, NotImplementedError, AttributeError):
            return False
        return True


requires_symlinks = pytest.mark.skipif(
    not _can_create_symlink(),
    reason="creating a symlink needs SeCreateSymbolicLinkPrivilege on Windows",
)
