"""What the backend takes from Kiro Crew, pinned.

A ``kiro_crew`` import pins the app to one wheel's module layout, and the first
release that moves that module would break every installed copy at start-up.
This backend still needs host functions that have no published surface for a
spawned app process yet (the credential fence, the link-safe read, the redaction
floor, the listener and process-tree helpers, the security event log; PORTING.md,
"Remaining gaps"). So the rule here is narrower than "never": no backend module
but ``backend/_host.py`` imports ``kiro_crew``, every import there sits in a
``try`` whose ``except Exception`` defines a refusing stand-in, and the exact set
of names is pinned below, so a new reach into the host changes this table in
review, with the gap it creates.
"""

from __future__ import annotations

import ast
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"

PINNED = {
    "kiro_crew.apps.proxy_auth": {"verify_proxy_request"},
    "kiro_crew.security": {
        "DENIED_ROOT_PARTS",
        "is_sensitive_path",
        "iter_credential_matches",
        "path_contains_sensitive",
        "redact_credentials",
        "redact_exfiltration_urls",
    },
    "kiro_crew.hooks": {"FileTooLargeError", "safe_read_file_bytes_nolink"},
    "kiro_crew.platform.context": {"redact_via_context"},
    "kiro_crew.security.redaction_patterns": {"_credential_matches"},
    "kiro_crew.security.redaction": {"_credential_matches"},
    "kiro_crew.sel": {"sel"},
    "kiro_crew.env": {"nvm_version_bin_dirs"},
    "kiro_crew.atomic_write": {"replace_with_retry"},
    "kiro_crew.platform_compat": {
        "CREATE_NEW_PROCESS_GROUP",
        "IS_MACOS",
        "IS_POSIX",
        "SIGKILL",
        "SIGTERM",
        "address_covers_loopback",
        "find_port_listeners",
        "get_ppid",
        "is_link_or_junction",
        "kill_process_tree",
        "strip_extended_length_prefix",
        "trusted_system_bin",
    },
}


def _host_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [a.name for a in node.names if a.name.split(".")[0] == "kiro_crew"]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if node.module.split(".")[0] == "kiro_crew":
                found.append(node.module)
        elif isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            if name in {"import_module", "__import__"} and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    if arg.value.split(".")[0] == "kiro_crew":
                        found.append(arg.value)
    return found


def _guarded_host_imports(path: Path) -> dict[str, set[str]]:
    """``{module: names}`` for every ``from kiro_crew... import`` under a guarding try."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out: dict[str, set[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Try):
            continue
        broad = any(
            isinstance(h.type, ast.Name) and h.type.id == "Exception" for h in node.handlers
        )
        for stmt in node.body:
            if isinstance(stmt, ast.ImportFrom) and (stmt.module or "").startswith("kiro_crew"):
                assert broad, f"{stmt.module} is imported outside an `except Exception` guard"
                out.setdefault(stmt.module or "", set()).update(a.name for a in stmt.names)
    return out


class TestNoHostImports(unittest.TestCase):
    def test_only_the_host_bridge_imports_kiro_crew(self) -> None:
        files = sorted(BACKEND.rglob("*.py"))
        self.assertTrue(files, "no backend modules found")
        for path in files:
            with self.subTest(module=path.relative_to(BACKEND.parent).as_posix()):
                if path.name == "_host.py":
                    self.assertTrue(_host_imports(path))
                else:
                    self.assertEqual(_host_imports(path), [])

    def test_every_host_import_is_guarded_and_pinned(self) -> None:
        bridge = BACKEND / "_host.py"
        guarded = _guarded_host_imports(bridge)
        self.assertEqual(guarded, PINNED)
        # Nothing reaches the host outside those guarded statements.
        self.assertEqual(set(_host_imports(bridge)), set(PINNED))

    def test_the_scan_sees_each_import_form(self) -> None:
        source = (
            "import kiro_crew\n"
            "import kiro_crew.apps as a\n"
            "from kiro_crew.executors import run_in_embed_pool\n"
            "import importlib\n"
            "importlib.import_module('kiro_crew.embeddings')\n"
            "__import__('kiro_crew')\n"
            "from . import kiro_crew_like\n"
            "import kiro_crewish\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "probe.py"
            path.write_text(source, encoding="utf-8")
            self.assertEqual(
                _host_imports(path),
                [
                    "kiro_crew",
                    "kiro_crew.apps",
                    "kiro_crew.executors",
                    "kiro_crew.embeddings",
                    "kiro_crew",
                ],
            )


if __name__ == "__main__":
    unittest.main()
