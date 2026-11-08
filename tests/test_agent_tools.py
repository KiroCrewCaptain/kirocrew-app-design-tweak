"""The ``design_tweak_update_thread`` agent tool, which this app declares and serves itself.

The tool is the agent's ONLY path to this app's ``POST /thread`` route. The app declares
it in ``app.json`` (``agentTools``) and serves it from its own backend; Kiro Crew lists it
in ``kirocrew-core`` and forwards each validated call through the signed app proxy to
``POST /api/agent-tools``. Ported from the built-in's
``apps/builtins/design_tweak/tests/test_agent_api_tool.py``:

- the **declaration** is the built-in's, byte for byte (``tests/fixtures/builtin-app.json``),
  and, against the real host (``KIROCREW_SRC``), validates cleanly and is enforced by the
  host's own schema builder: ``status`` restricted to the one forward-progress value and
  each string bounded. The id grammar and the ``text or status`` rule are the backend's
  (``_h_thread``), not restated in the schema;
- the **backend**: ``POST /api/agent-tools`` turns the call into exactly the ``/thread``
  write the tool always made (``id`` and, when given, ``cid`` in the query; the agent's
  note and status in a ``role: agent`` body), so ``_h_thread`` stays the one place that
  validates ids and redacts the note.

The built-in's gateway-admission and proxy-header cases test Kiro Crew's own forwarding
route, not this app, and stay with that code (``test/test_app_agent_tools.py``).
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from typing import Any

from backend import server
from tests.design_tweak_backend_helpers import _JsonHandler
from tests.design_tweak_backend_helpers import isolated_queue_fixture  # noqa: F401

APP_ROOT = Path(__file__).resolve().parents[1]
_TOOL = "design_tweak_update_thread"
REAL_HOST = bool(os.environ.get("KIROCREW_SRC"))


def _manifest() -> dict[str, Any]:
    return json.loads((APP_ROOT / "app.json").read_text(encoding="utf-8"))


def _builtin() -> dict[str, Any]:
    return json.loads((APP_ROOT / "tests" / "fixtures" / "builtin-app.json").read_text("utf-8"))


class TestDeclaration(unittest.TestCase):
    def test_the_block_is_the_builtins(self) -> None:
        self.assertEqual(_manifest()["agentTools"], _builtin()["agentTools"])

    def test_one_tool_on_one_route(self) -> None:
        block = _manifest()["agentTools"]
        self.assertEqual(block["route"], "agent-tools")
        self.assertEqual([t["name"] for t in block["tools"]], [_TOOL])
        (tool,) = block["tools"]
        self.assertEqual(tool["title"], "Update design-tweak thread")
        self.assertEqual(tool["maxResultChars"], 20_000)
        schema = tool["inputSchema"]
        self.assertEqual(schema["required"], ["request_id"])
        self.assertEqual(schema["properties"]["status"]["enum"], ["done"])
        caps = {k: v.get("maxLength") for k, v in schema["properties"].items()}
        self.assertEqual(caps, {"request_id": 200, "comment_id": 200, "text": 2_048, "status": None})


@unittest.skipUnless(REAL_HOST, "the host's manifest reader and schema builder (KIROCREW_SRC)")
class TestTheHostReadsTheDeclaration(unittest.TestCase):  # pragma: no cover - the real-host run
    def setUp(self) -> None:
        from kiro_crew.apps.app_agent_tools import DeclaredTool, build_tool_schema
        from kiro_crew.apps.manifest import AppManifest
        from kiro_crew.validation import ValidationError, validate_tool_args

        self.manifest = AppManifest.from_json_file(APP_ROOT / "app.json")
        (decl,) = [t for t in self.manifest.agentTools.tools if t.name == _TOOL]
        tool = DeclaredTool(app=self.manifest.name, route=self.manifest.agentTools.route, decl=decl)
        self.schema = build_tool_schema(tool)
        self.decl = decl
        self.validate_tool_args = validate_tool_args
        self.ValidationError = ValidationError

    def _validate(self, **kwargs: Any) -> dict[str, Any]:
        return self.validate_tool_args(kwargs, self.schema)

    def test_the_manifest_validates_and_declares_the_tool_cleanly(self) -> None:
        self.assertEqual(self.manifest.validate(), [])
        self.assertEqual(self.manifest.agentTools.validate(self.manifest.name), [])
        self.assertEqual(self.manifest.agentTools.route, "agent-tools")
        self.assertEqual(self.decl.title, "Update design-tweak thread")
        self.assertEqual(self.decl.max_result_chars, 20_000)

    def test_a_text_note_passes(self) -> None:
        cleaned = self._validate(request_id="r-1", comment_id="c.2", text="editing")
        self.assertEqual(cleaned, {"request_id": "r-1", "comment_id": "c.2", "text": "editing"})

    def test_a_status_only_done_passes(self) -> None:
        self.assertEqual(self._validate(request_id="r-1", status="done")["status"], "done")

    def test_status_is_restricted_to_done(self) -> None:
        """Forward progress only: the tool can never carry a destructive status."""
        for bad in ("resolve", "clear", "new", "sent", "dismiss", "DONE"):
            with self.assertRaises(self.ValidationError, msg=bad):
                self._validate(request_id="r-1", status=bad)

    def test_request_id_is_required(self) -> None:
        with self.assertRaises(self.ValidationError):
            self._validate(text="x")

    def test_each_string_is_bounded(self) -> None:
        for field, cap in (("request_id", 200), ("comment_id", 200), ("text", 2_048)):
            args = {"request_id": "r", field: "a" * (cap + 1)}
            with self.assertRaises(self.ValidationError, msg=field):
                self._validate(**args)

    def test_an_undeclared_argument_is_refused(self) -> None:
        with self.assertRaises(self.ValidationError):
            self._validate(request_id="r", role="user")


class _Handler(server.Handler):
    """A socketless backend handler that records the ``/thread`` call it would make."""

    def __init__(self, envelope: dict[str, Any]) -> None:
        self.path = "/api/agent-tools"
        self._cached_body = json.dumps(envelope).encode("utf-8")
        self.thread_calls: list[tuple[dict[str, list[str]], dict[str, Any]]] = []
        self.json_sent: list[tuple[int, Any]] = []

    def _h_thread(self, query: dict[str, list[str]]) -> None:
        self.thread_calls.append((query, self._read_body()))

    def _json(self, code: int, payload: Any) -> None:
        self.json_sent.append((code, payload))


def _serve(arguments: Any, tool: str = _TOOL) -> _Handler:
    handler = _Handler({"tool": tool, "arguments": arguments})
    handler._h_agent_tools()
    return handler


class TestBackendServesTheTool(unittest.TestCase):
    """``/agent-tools`` is the ``/thread`` write the tool always made."""

    def test_per_comment_call_carries_id_and_cid(self) -> None:
        h = _serve({"request_id": "req-1", "comment_id": "cmt-2", "text": "editing"})
        self.assertEqual(
            h.thread_calls,
            [({"id": ["req-1"], "cid": ["cmt-2"]}, {"role": "agent", "text": "editing"})],
        )

    def test_request_level_call_omits_cid(self) -> None:
        h = _serve({"request_id": "req-1", "text": "rebuilding"})
        self.assertEqual(h.thread_calls[0][0], {"id": ["req-1"]})

    def test_body_is_role_agent_with_text_and_status(self) -> None:
        h = _serve({"request_id": "r", "comment_id": "c", "text": "done!", "status": "done"})
        self.assertEqual(h.thread_calls[0][1], {"role": "agent", "text": "done!", "status": "done"})

    def test_status_only_body_has_no_text_key(self) -> None:
        h = _serve({"request_id": "r", "comment_id": "c", "status": "done"})
        self.assertEqual(h.thread_calls[0][1], {"role": "agent", "status": "done"})

    def test_the_note_reaches_the_thread_write_unchanged(self) -> None:
        """``_h_thread`` redacts every note before it persists; a scrub here would be a second one."""
        note = "token ghp_" + "A" * 36
        self.assertEqual(_serve({"request_id": "r", "text": note}).thread_calls[0][1]["text"], note)

    def test_an_undeclared_tool_is_not_served(self) -> None:
        h = _serve({"request_id": "r", "text": "x"}, tool="design_tweak_clear")
        self.assertEqual(h.thread_calls, [])
        self.assertEqual(h.json_sent[0][0], 404)
        self.assertEqual(h.json_sent[0][1]["code"], "unknown_tool")

    def test_arguments_that_are_not_an_object_are_not_served(self) -> None:
        h = _serve(["r"])
        self.assertEqual(h.thread_calls, [])
        self.assertEqual(h.json_sent[0][0], 404)

    def test_the_route_is_dispatched_by_post(self) -> None:
        seen: list[str] = []

        class _Routed(_Handler):
            def _authorized(self, *_a: Any, **_k: Any) -> bool:
                return True

            def _read_raw_body(self) -> bytes:
                return self._cached_body

            def _h_agent_tools(self) -> None:
                seen.append(self.path)

        _Routed({"tool": _TOOL, "arguments": {}}).do_POST()
        self.assertEqual(seen, ["/api/agent-tools"])


def _seed_sent_request(queue: Path) -> None:
    comment = {
        "cid": "c1",
        "index": 1,
        "status": "sent",
        "comment": "Make the title bold",
        "createdAt": "2026-01-01T00:00:01Z",
        "thread": [{"role": "user", "text": "Make the title bold", "ts": "2026-01-01T00:00:01Z"}],
    }
    request = {
        "type": "visual_edit_batch",
        "id": "req1",
        "number": 1,
        "state": "sent",
        "projectId": "proj1",
        "projectRoot": "/tmp/fake",
        "createdAt": "2026-01-01T00:00:00Z",
        "sentAt": "2026-01-01T00:00:02Z",
        "thread": [],
        "comments": [comment],
    }
    server._write_request(server._request_file(queue, "req1"), request)


def _call(arguments: dict[str, Any]) -> _JsonHandler:
    body = json.dumps({"tool": _TOOL, "arguments": arguments}).encode("utf-8")
    handler = _JsonHandler(body, "/api/agent-tools")
    handler._h_agent_tools()
    return handler


def test_a_call_lands_on_the_comment_thread_redacted(isolated_queue):
    """The whole path: the tool call becomes the stored progress note and the done dot."""
    _seed_sent_request(isolated_queue)
    secret = "ghp_" + "A" * 36
    handler = _call({"request_id": "req1", "comment_id": "c1", "text": f"editing, {secret}"})
    assert handler.json_sent[-1][0] == 200
    handler = _call({"request_id": "req1", "comment_id": "c1", "status": "done"})
    assert handler.json_sent[-1][0] == 200

    saved = json.loads(server._request_file(isolated_queue, "req1").read_text("utf-8"))
    (comment,) = saved["comments"]
    notes = [entry for entry in comment["thread"] if entry.get("role") == "agent"]
    assert notes and notes[0]["text"].startswith("editing, ")
    assert secret not in json.dumps(saved)
    assert comment["status"] == "done"


def test_a_bad_request_id_is_refused_by_the_thread_route(isolated_queue):
    """The id grammar is ``_h_thread``'s, so the tool route inherits its refusal."""
    _seed_sent_request(isolated_queue)
    handler = _call({"request_id": "../req1", "text": "x"})
    assert handler.json_sent[-1][0] in (400, 404)


if __name__ == "__main__":
    unittest.main()
