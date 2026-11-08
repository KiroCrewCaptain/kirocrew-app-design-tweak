"""What an existing user's copy of the built-in needs from this repository.

Kiro Crew adopts a user's built-in record onto this repository in place, at a
pinned commit, with no consent dialog, so the tree must be something it can take
over unchanged:

- the same name, version, skills, ``storage`` grant, platform and
  ``defaultEnabled`` as the built-in (``tests/fixtures/builtin-app.json`` is its
  manifest on Kiro Crew ``main`` at ``6d07df11cf``), and no agents, MCP servers or
  overlays it did not have;
- the built-in's backend paths, so the proxy path (and the agent's progress
  route behind it) is the same;
- ``permissions.api`` widened by exactly the host chat endpoints the built-in
  page reached without declaring them (PORTING.md, "Remaining gaps");
- nothing that needs a build at install time, and no symlinks or file names a
  Windows checkout cannot hold;
- a committed UI bundle that imports only modules the dashboard provides, and
  from the two SDK modules only names every supported host exports.
"""

from __future__ import annotations

import json
import os
import re
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
BUNDLE = APP_ROOT / "ui" / "dist" / "index.mjs"

HOST_MODULES = {
    "react",
    "react-dom",
    "react/jsx-runtime",
    "lucide-react",
    "@tanstack/react-query",
    "@kirocrew/app-sdk",
    "@kirocrew/app-sdk/ui",
}

# What a host BEFORE App Kit level 1 exports from each SDK module (its
# public/vendor/*.mjs stubs). Every named import must stay in this set.
LEVEL0_EXPORTS = {
    "@kirocrew/app-sdk": {
        "useAppApi",
        "useAppEvents",
        "useTheme",
        "useAppInfo",
        "useNavigate",
        "useNotify",
        "useNavBadge",
        "useChatLauncher",
        "AppApiProvider",
        "useImeGuard",
        "useLanguageGeneration",
        "activeLocale",
        "fmtNumber",
        "fmtDate",
        "fmtTime",
        "fmtDateTime",
        "fmtRelative",
        "compareText",
    },
    "@kirocrew/app-sdk/ui": {
        "Card",
        "CardTitle",
        "Btn",
        "SendBtn",
        "Input",
        "SearchInput",
        "Badge",
        "SourceBadge",
        "StatCard",
        "Skeleton",
        "ContentSkeleton",
        "EmptyState",
        "PageHeader",
        "Toggle",
        "InfoTip",
        "SegmentedControl",
        "MarkdownRenderer",
        "Clickable",
        "Modal",
        "ErrorNotice",
        "SettingsSection",
        "SettingsCard",
        "SettingsInput",
        "SettingsToggle",
        "SettingsSelect",
    },
}

# The host chat endpoints the page calls (slot adopt, project bind, resume,
# detail read, the send). The built-in page reached them as dashboard code. A
# bare entry is a prefix grant on both matchers, so this one entry covers
# `/api/chat/slots/*` too, and every other `/api/chat/*` route with it.
CHAT_GRANT = ["/api/chat"]

_UNTRACKED_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".venv"}
_WINDOWS_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", re.IGNORECASE)
_STATIC_IMPORT = re.compile(
    r"^import\s+(?:(?P<clause>[^'\"]+?)\s+from\s+)?[\"'](?P<spec>[^\"']+)[\"'];?\s*$",
    re.MULTILINE,
)


def _manifest() -> dict:
    return json.loads((APP_ROOT / "app.json").read_text(encoding="utf-8"))


def _builtin() -> dict:
    return json.loads((APP_ROOT / "tests" / "fixtures" / "builtin-app.json").read_text("utf-8"))


def _text() -> str:
    return BUNDLE.read_text(encoding="utf-8")


def _bundle_imports() -> list[tuple[str, str]]:
    return [(m["spec"], (m["clause"] or "").strip()) for m in _STATIC_IMPORT.finditer(_text())]


def _named(clause: str) -> set[str]:
    match = re.search(r"\{([^}]*)\}", clause)
    if not match:
        return set()
    return {part.split(" as ")[0].strip() for part in match.group(1).split(",") if part.strip()}


def _tree() -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(APP_ROOT):
        dirnames[:] = [d for d in dirnames if d not in _UNTRACKED_DIRS]
        files += [Path(dirpath) / name for name in filenames]
        files += [Path(dirpath) / d for d in dirnames if (Path(dirpath) / d).is_symlink()]
    return files


class TestTheBundle(unittest.TestCase):
    def test_the_entry_the_manifest_names_is_committed(self) -> None:
        ui = _manifest()["ui"]
        self.assertEqual(ui["entry"], "dist/index.mjs")
        self.assertTrue((APP_ROOT / "ui" / ui["entry"]).is_file(), "run `npm run build` in ui/")

    def test_it_imports_only_what_the_host_provides(self) -> None:
        imports = _bundle_imports()
        self.assertTrue(imports, "no import statements found; the scan is broken")
        starts = re.findall(r"^import\b", _text(), re.MULTILINE)
        self.assertEqual(len(starts), len(imports), "an import the scan could not parse")
        self.assertLessEqual({spec for spec, _ in imports}, HOST_MODULES)
        self.assertNotRegex(_text(), r"\bimport\s*\(", "a dynamic import would load a second file")

    def test_named_sdk_imports_exist_on_every_supported_host(self) -> None:
        for spec, clause in _bundle_imports():
            if spec in LEVEL0_EXPORTS:
                with self.subTest(module=spec):
                    self.assertLessEqual(_named(clause), LEVEL0_EXPORTS[spec])

    def test_it_bundles_no_router_and_no_dashboard_module(self) -> None:
        self.assertNotIn("react-router", _text())
        self.assertNotIn("@radix-ui", _text())

    def test_no_build_machine_path_is_baked_in(self) -> None:
        self.assertNotRegex(_text(), r"/(?:home|Users|workplace)/[a-z]|[A-Za-z]:\\\\")


class TestTheManifest(unittest.TestCase):
    def test_what_adoption_compares_is_the_builtins(self) -> None:
        manifest, builtin = _manifest(), _builtin()
        for key in ("name", "version", "skills", "defaultEnabled", "platform"):
            with self.subTest(field=key):
                self.assertEqual(manifest[key], builtin[key])
        self.assertNotIn("agents", builtin)
        self.assertNotIn("agents", manifest)

    def test_the_grant_is_the_builtins_plus_the_chat_endpoints(self) -> None:
        manifest, builtin = _manifest(), _builtin()
        self.assertEqual(manifest["permissions"]["api"], builtin["permissions"]["api"] + CHAT_GRANT)
        rest = {k: v for k, v in manifest["permissions"].items() if k != "api"}
        builtin_rest = {k: v for k, v in builtin["permissions"].items() if k != "api"}
        self.assertEqual(rest, builtin_rest)

    def test_declares_nothing_adoption_cannot_carry(self) -> None:
        manifest = _manifest()
        self.assertNotIn("mcpServers", manifest)
        self.assertNotIn("overlays", manifest["ui"])
        self.assertNotIn("sessionApproval", manifest)
        self.assertNotIn("sessionApproval", manifest["permissions"])
        self.assertIs(manifest["defaultEnabled"], False)

    def test_the_backend_is_a_file_entry_on_the_builtins_proxy_contract(self) -> None:
        manifest, builtin = _manifest(), _builtin()
        self.assertEqual(manifest["backend"]["entryPoint"], "backend/server.py")
        for key in ("port", "healthCheck"):
            with self.subTest(field=key):
                self.assertEqual(manifest["backend"][key], builtin["backend"][key])
        self.assertTrue((APP_ROOT / manifest["backend"]["entryPoint"]).is_file())
        # No requirements.txt anywhere: the backend is stdlib-only and runs on the
        # gateway's interpreter, which is what lets the host bridge import it.
        self.assertFalse((APP_ROOT / "requirements.txt").exists())
        self.assertFalse((APP_ROOT / "backend" / "requirements.txt").exists())

    def test_the_page_carries_no_glyph_of_its_own(self) -> None:
        """The legacy route and sidebar glyph come from Kiro Crew's pin, not from here."""
        pages = _manifest()["ui"]["pages"]
        self.assertEqual(pages, [{"route": "/apps/design-tweak", "label": "Design Tweak"}])

    def test_declares_a_kiro_crew_that_can_run_it(self) -> None:
        declared = _manifest().get("minKiroCrewVersion", "")
        self.assertRegex(declared, r"^\d+\.\d+\.\d+$")
        self.assertGreaterEqual(tuple(int(p) for p in declared.split(".")), (0, 12, 0))

    def test_art_is_repo_relative_png(self) -> None:
        manifest = _manifest()
        fields = ("iconPath", "heroImage", "heroImageDark", "heroImageDetail", "heroImageDetailDark")
        for key in fields:
            with self.subTest(field=key):
                rel = manifest[key]
                self.assertRegex(rel, r"^assets/[a-z-]+\.png$")
                self.assertTrue((APP_ROOT / rel).is_file())
                self.assertEqual((APP_ROOT / rel).read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        for rel in manifest["screenshots"]:
            with self.subTest(screenshot=rel):
                self.assertTrue((APP_ROOT / rel).is_file())
                self.assertEqual((APP_ROOT / rel).read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        self.assertNotIn("iconUrl", manifest)
        for key in fields:
            self.assertFalse(str(manifest.get(key, "")).startswith("/app-assets/"), key)

    def test_listing_copy_matches_the_bundled_catalogs(self) -> None:
        manifest = _manifest()
        catalogs = {
            p.stem: json.loads(p.read_text(encoding="utf-8"))["manifest"]
            for p in sorted((APP_ROOT / "ui" / "i18n").glob("*.json"))
        }
        english = catalogs.pop("en")
        self.assertEqual(manifest["displayName"], english["display_name"])
        self.assertEqual(manifest["description"], english["description"])
        self.assertEqual(manifest["ui"]["pages"][0]["label"], english["page_label"])
        self.assertEqual(set(manifest["l10n"]), set(catalogs))
        for locale, strings in catalogs.items():
            with self.subTest(locale=locale):
                self.assertEqual(
                    manifest["l10n"][locale],
                    {
                        "displayName": strings["display_name"],
                        "description": strings["description"],
                        "pageLabel": strings["page_label"],
                    },
                )

    def test_l10n_is_within_the_host_parser_limits(self) -> None:
        l10n = _manifest()["l10n"]
        self.assertLessEqual(len(l10n), 32)
        for locale, entry in l10n.items():
            with self.subTest(locale=locale):
                self.assertRegex(locale, r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$")
                self.assertLessEqual(set(entry), {"displayName", "description", "pageLabel"})
                self.assertLessEqual(len(entry["displayName"]), 120)
                self.assertLessEqual(len(entry["description"]), 1000)
                self.assertLessEqual(len(entry["pageLabel"]), 60)


class TestTheTreeIsAdoptable(unittest.TestCase):
    def test_no_root_build_file(self) -> None:
        for name in ("package.json", "pyproject.toml", "setup.py", "requirements.txt", ".gitattributes"):
            with self.subTest(name=name):
                self.assertFalse((APP_ROOT / name).exists())

    def test_no_link_and_no_unportable_name(self) -> None:
        seen: dict[str, str] = {}
        for path in _tree():
            rel = path.relative_to(APP_ROOT).as_posix()
            with self.subTest(path=rel):
                self.assertFalse(path.is_symlink(), "a link is refused by adoption")
                self.assertTrue(path.is_file(), "only regular files")
                self.assertNotRegex(rel, r"[\\:]")
                for part in rel.split("/"):
                    self.assertFalse(part.endswith((".", " ")), part)
                    self.assertIsNone(_WINDOWS_RESERVED.match(part.split(".")[0]), part)
                self.assertNotIn(rel.lower(), seen, f"differs only in case from {seen.get(rel.lower())}")
                seen[rel.lower()] = rel

    def test_the_tree_is_within_the_adoption_caps(self) -> None:
        files = _tree()
        self.assertLessEqual(len(files), 5000)
        self.assertLessEqual(sum(p.stat().st_size for p in files), 64 * 1024 * 1024)

    def test_the_skill_and_the_injected_overlay_ship(self) -> None:
        self.assertTrue((APP_ROOT / "skills" / "visual-edit" / "SKILL.md").is_file())
        self.assertTrue((APP_ROOT / "inject" / "select-to-edit.js").is_file())


if __name__ == "__main__":
    unittest.main()
