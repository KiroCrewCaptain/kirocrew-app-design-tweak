"""Synthetic, obviously fake credential values for the redaction tests.

The same values Kiro Crew's own tests use (``kiro_crew.testing.synthetic_credentials``),
rebuilt here because the default suite runs without the host. A real GitHub
classic token ends in a base62 CRC32 of its body, and the host's detector checks
it, so these carry a valid one. None is a real credential.
"""

from __future__ import annotations

import string
import zlib

ALNUM = string.ascii_letters + string.digits
_BASE62 = string.digits + string.ascii_uppercase + string.ascii_lowercase
_GITHUB_CHECK_LEN = 6


def synth(n: int, alphabet: str = ALNUM, seed: int = 0) -> str:
    """A deterministic string of ``n`` characters that mixes the alphabet's classes."""
    step = 7 if len(alphabet) % 7 else 11
    return "".join(alphabet[(seed * 13 + i * step) % len(alphabet)] for i in range(n))


def base62_crc32(body: str) -> str:
    """The six-character base62 CRC32 a GitHub token appends to its body."""
    crc = zlib.crc32(body.encode("ascii"))
    digits = ""
    while crc:
        crc, rem = divmod(crc, 62)
        digits = _BASE62[rem] + digits
    return digits.rjust(_GITHUB_CHECK_LEN, "0")


def github_classic(prefix: str = "ghp_", seed: int = 1) -> str:
    """A GitHub classic token with a valid checksum."""
    body = synth(30, ALNUM, seed)
    return prefix + body + base62_crc32(body)
