# Porting notes: built-in → external app

This repository was ported from Kiro Crew's built-in app at
`src/kiro_crew/apps/builtins/design_tweak/` (KiroCrew `main` at `4bb268b4e9`),
its dashboard page at `website/src/apps/design-tweak/`, its store art at
`website/public/app-assets/design-tweak/`, and its tests: the one under the app's
own `tests/` that tests the app (`test_windows_support.py`), the nine
`test/test_design_tweak_*.py` files with their shared
`test/design_tweak_backend_helpers.py`, and the ten website tests named in
[Tests](#tests). Every change Kiro Crew made to that wheel copy since, up to
`main` at `6d07df11cf`, is ported here too: see
[Wheel fixes ported since the snapshot](#wheel-fixes-ported-since-the-snapshot).

Line numbers below refer to that commit unless they name a file in this
repository. "Gap" means something the built-in gets from Kiro Crew that an
external app has no public way to get today. Each gap is a Kiro Crew change, not
a change here.

## What carried over unchanged

- `app.json` `name` (`design-tweak`), `version` (`0.10.0`), `author`, `tags`,
  `skills`, `defaultEnabled` (`false`), `platform`, `permissions.storage`, every
  display field, `useCases` and `configuration`. `tests/test_manifest_contract.py`
  compares them with the built-in's manifest (`tests/fixtures/builtin-app.json`).
- The backend's process model: a stdlib `ThreadingHTTPServer` the gateway spawns
  and reverse-proxies at `/apps/design-tweak/api/*`, with `port: "auto"` and
  `healthCheck: "/health"`. Every route, its validation and response shape, the
  project registry, the request queue, the static preview servers, the injecting
  dev-server proxy, dev-server discovery and lifecycle, the credential and
  crew-home fences, and the log-tail redaction are the built-in's five modules
  line for line: `diff` against them shows only the host bridge, the `/health`
  field and the three changes in the table below.
- The data location and format. The gateway hands a spawned backend
  `KIROCREW_APP_DATA_DIR = <data home>/apps/design-tweak/data`, which
  `backend/server.py` already read first (built-in `server.py:151-157`), so a
  user's `config.json` (registered projects), `queue/` and `handled/` are read as
  they are.
- The agent's progress tool: the `agentTools` block in `app.json` (the tool
  `design_tweak_update_thread`, its description, argument schema, title and
  answer cap, on the route `agent-tools`) is the built-in's, byte for byte, and
  `backend/http_api.py` serves `POST /api/agent-tools` as the same one `/thread`
  write the built-in's backend does (`tests/test_agent_tools.py`).
- `inject/select-to-edit.js` (the in-preview overlay) and
  `skills/visual-edit/SKILL.md`, byte for byte. The skill's name, and so its
  materialized name, is the built-in's.
- The page's markup, class strings and behaviour, its saved-state keys
  (`ste_dims_map`, `ste_rail_w`, `ste_disconnected`), and the per-project chat
  slot key (`design-tweak-<digest of the folder path>`), so an existing user's
  sessions, layout and pins come back.

## What changed, and why

| Built-in | Here | Why |
|---|---|---|
| `"entryPoint": "kiro_crew.apps.builtins.design_tweak.backend.server"` (`app.json:38`) | `"entryPoint": "backend/server.py"` | A module-style entry resolves only inside the Kiro Crew package (`apps/backend.py:450-460`, `shipped_builtin_module_path`). A file entry inside the app's own tree is the external form. |
| A spawned backend | Still a spawned backend, **not** `backend.hooks` | Deliberate. This backend starts the user's own dev server, binds its own loopback preview servers and relays their WebSockets: in-gateway hooks would run all of that inside the gateway process. The launcher wraps an app backend in the OS sandbox and the cgroup ceiling at spawn (`apps/backend.py`), and keeping the process also keeps the proxy path, so `/apps/design-tweak/api/agent-tools` (the agent's progress route, gap 3) and the page's backend paths are the built-in's. The App Kit hook-context seams (`ctx.require_owner`, `ctx.embed`, `ctx.sdk_level`, and level 2's `ctx.lifecycle`, `ctx.turns`, `ctx.untrusted` and `ctx.auto_approve`) have no consumer in a spawned backend, and none of them is something the built-in used. |
| `from kiro_crew.apps.builtins.design_tweak.backend import dev_preview, http_api, preview_files, request_state` (`backend/server.py:33-38`) | Relative imports, with a script-form fallback (`backend/server.py:33-45`) | The gateway runs a file entry as a script (`python backend/server.py`, working directory the app root), where there is no package; the tests import it as the `backend` package. The fallback adds the script's own directory to `sys.path`, so an isolated launch (`python -I`) finds the siblings too (`tests/test_spawned_script.py`). |
| `from kiro_crew... import ...` at module top (`backend/server.py:39-65`, `backend/preview_files.py:14-15`, `backend/request_state.py:23`) | One feature-detected host bridge, `backend/_host.py` | See [Host bridge](#host-bridge-private-kiro-crew-imports). |
| `sel().log_api_access(..., source="builtin-app")` (`backend/http_api.py:90`) | `source="app"` | This copy is an installed app and says so, with the source the host's own app audit SDK writes. |
| `/health` | Adds `hostGaps: []` | Names any host capability this process could not import, so an operator can see why something is refused. |
| `handle = log.open("wb")` passed to the dev server and never closed (`backend/server.py:856`) | Opened in a `with` block around the spawn (`backend/server.py`, `_start_dev_proc`) | The child gets its own copy of the descriptor; the built-in kept one open file per dev server for the backend's lifetime. Found by this repository's tests, which run with warnings as errors. |
| `iconUrl` / `heroImage*` / `screenshots` as absolute `/app-assets/...` files (`app.json:5`, `:55-61`) | `iconPath` / `heroImage*` / `screenshots` as repo-relative PNGs under `assets/` | A registry app's art is repo-relative, and the catalog's publish step refuses SVG for a non-builtin source. The PNGs were rendered from the built-in SVGs (the icon at 512×512 on an opaque tile with its `--ico-a` / `--ico-b` tokens resolved to fixed pink and violet; heroes at 1200×675 and detail banners at 1200×288, with transparent corners). The original SVGs are kept beside them. The store screenshot is the README's light hero. |
| `ui.pages` `[{"route": "/design-tweak", "icon": "Paintbrush"}]`, page compiled into the dashboard (`app.json:31`, `website/src/apps/builtinRegistry.ts:79`) | `ui.entry: "dist/index.mjs"` (a committed ESM bundle built from `ui/src/`), `ui.pages` `[{"route": "/apps/design-tweak", "label": "Design Tweak"}]`, no `icon` | An installed app ships its page as a bundle AppHost loads. The legacy `/design-tweak` route, nav id and `Paintbrush` glyph of an ADOPTED record come from Kiro Crew's adoption pin (`legacyNav`), never from this manifest, so a fresh install cannot claim them. |
| `permissions.api` `["/apps/design-tweak/api", "/apps/design-tweak/api/*"]` (`app.json:22-25`) | The same two, plus `"/api/chat"` | The page creates and binds its per-project chat session, reads its transcript to confirm delivery, and sends the batch, all on the host's chat endpoints: `POST /api/chat?ws=1`, `POST /api/chat/slots` and `GET /api/chat/slots/{key}` (`ui/src/api.ts:221-275`). The compiled built-in page called them as dashboard code; a bundle calls through the scoped client, which refuses an undeclared path. A bare entry is a PREFIX grant, so `"/api/chat"` reaches every `/api/chat/*` route, not only those three. A separate `"/api/chat/slots"` entry would add nothing, so there is none. This is a widening (gap 2). |
| App Store copy keys in the dashboard catalogs (`website/src/components/appstore/appManifest.ts:199-205`) | `l10n` block in `app.json`, one entry per shipped non-English locale | The listing copy travels with the app. It is the `manifest` subtree of `ui/i18n/<locale>.json`, kept equal by a test. The built-in has no `highlights`, so neither does the block. |
| `"license": "MIT"` (`app.json:8`) | `"license": "Apache-2.0"` | The built-in's code shipped under Kiro Crew's Apache-2.0 licence, which is this repository's `LICENSE`; the manifest now says the same. Adoption does not compare it. |
| `"minKiroCrewVersion": "0.1.0"` (`app.json:17`) | `"0.12.0"` | The first Kiro Crew whose dashboard reads `l10n` and whose adoption can carry this record. The page uses only names every earlier App SDK exports. |

## Host bridge: private Kiro Crew imports

The backend runs under the gateway's own interpreter (it has no
`requirements.txt`, so no app venv is made), so it imports the host's own
security code instead of copying it, which would drift from the policy every
other Kiro Crew surface enforces. None of these is a published App Kit surface
for a spawned backend yet. Each import is feature-detected (`try` /
`except Exception`), and a missing one never widens access.
`tests/test_no_host_imports.py` pins the exact list and that each is guarded;
`tests/test_host_stand_ins.py` checks every stand-in refuses; the CI job
`real-host` runs the whole backend suite against the real Kiro Crew at
`6d07df11cf` (which also reads `app.json`'s `agentTools` through the host's own
manifest reader and schema builder), and the `test` job against
`tests/host_double.py`.

| Built-in import | Use | Without it |
|---|---|---|
| `kiro_crew.apps.proxy_auth.verify_proxy_request` | The gateway's signature on every proxied request | Every route but `/health` answers 401 (this one IS public: App Kit `api-reference.md`, "Proxy Authentication") |
| `kiro_crew.security.{is_sensitive_path, path_contains_sensitive, DENIED_ROOT_PARTS}` | The shared credential fence, on every project root and served file | Every path is sensitive: no project registers and nothing is served |
| `kiro_crew.hooks.{safe_read_file_bytes_nolink, FileTooLargeError}` | The link-safe, inode-pinned read behind the static preview and `package.json` | Every read is refused |
| `kiro_crew.security.{redact_credentials, redact_exfiltration_urls}` | The redaction floor on comment and thread text, both ways | The text is withheld, never shown unredacted |
| `kiro_crew.platform.context.redact_via_context` | The companion-aware redaction of a failed dev server's log tail | The tail is withheld |
| `kiro_crew.security.iter_credential_matches` (the built-in's own import since Kiro Crew #31445), else the same scanner under its earlier private names `kiro_crew.security.redaction_patterns._credential_matches` (Kiro Crew 0.12.0) and `kiro_crew.security.redaction._credential_matches` | The static server's refusal to serve a text file carrying a key | Every text file reads as carrying one: nothing textual is served |
| `kiro_crew.sel.sel` | The security event log | The audit line goes to this process's own log |
| `kiro_crew.env.nvm_version_bin_dirs` | The nvm install layout, to find `npm` / `pnpm` / `yarn` | Only the fixed install directories are searched |
| `kiro_crew.platform_compat.{find_port_listeners, address_covers_loopback, get_ppid, kill_process_tree, trusted_system_bin, is_link_or_junction, strip_extended_length_prefix, IS_POSIX, IS_MACOS, SIGTERM, SIGKILL, CREATE_NEW_PROCESS_GROUP}` | Listener enumeration, process-tree ownership and kill, the trusted `lsof` / `osascript`, link checks | No foreign server is adopted, no process is claimed as ours, no system tool is run; the dev server this backend started is still stopped through its own process group |
| `kiro_crew.atomic_write.replace_with_retry` (the built-in's since Kiro Crew #29267) | The rename that publishes `config.json` and a request file, retried on Windows while a reader holds the destination | A plain `os.replace`, as before that change |
| `kiro_crew.subprocess_utf8.UTF8_TEXT` | Text mode for child processes | Stated in `backend/_host.py` (three keyword arguments) |

## Remaining gaps

Gaps 1, 2 and 3 block the adoption pin: with any of them open an existing
user's record either does not move (gap 2) or moves and loses something (gap 3).
Each needs a Kiro Crew change or an owner decision, not a change here.

1. **A public backend seam for spawned app processes** (`backend/_host.py`). The
   names above are a Kiro Crew change away from a published module, for example
   `kiro_crew.apps.sdk.backend` with the credential fence, a safe read, the
   redaction floor, the event log and the process helpers. Until then a release
   that moves one makes this app refuse that capability (closed, reported in
   `/health`), not break open. The credential scanner is public now
   (`kiro_crew.security.iter_credential_matches`); the private fallback is read
   only on a Kiro Crew 0.12.0 host. Kiro Crew's `security/paths.py:225` comment
   names this app as a reader. Whether such a seam exists is an open owner
   question on Kiro Crew #26967.
2. **The chat grant widens `permissions.api`, so adoption refuses the move.**
   Adoption's permission-parity check (E9, `apps/builtin_adoption_checks.py`,
   `permission_refusal`) holds back every entry the built-in's manifest did not
   declare, and refuses with `permission_widening`. Checked on Kiro Crew `main`
   at `6d07df11cf` with the built-in registered in a scratch data home:
   `permission_refusal("design-tweak", <this app.json>)` answers
   `permission_widening`, and the same manifest without `"/api/chat"` answers
   `None`. So an existing user's record stays on the built-in. The built-in page
   reached `/api/chat` and `/api/chat/slots/*` as compiled dashboard code with no
   declaration (`website/src/apps/design-tweak/api.ts:219-232`, `:367`); this
   bundle calls them through the scoped client, which refuses an undeclared path,
   so the entry cannot be dropped without breaking delivery to the agent.
   The grant is wider than those calls. A bare `permissions.api` entry is a
   prefix match on both the gateway and the browser client (Kiro Crew's
   `dashboard/token_auth_app_scope.py`, `_api_pattern_matches`, ends in
   `path == pattern or path.startswith(pattern + "/")`; the SDK's
   `scopedApi.ts` matches the same way), and there is no exact-only form. So
   this app's token can reach every `/api/chat/*` route, including ones the page
   never calls, such as `DELETE /api/chat/slots/{slot}`,
   `GET /api/chat/slots/{slot}/export`, `PATCH /api/chat/slots/{slot}/mode` and
   `DELETE /api/chat/folders/{id}`. The page itself calls only
   `POST /api/chat?ws=1`, `POST /api/chat/slots` and `GET /api/chat/slots/{key}`.
   Four built-ins declare the same bare entry (`auto_improvement`,
   `design_critique`, `ops_mission_control`, `spec_builder`), so this is the
   existing pattern, not a new class of grant. Closing this is a Kiro Crew
   decision: declare `"/api/chat"` in the wheel built-in's own manifest in a
   release before the pin (so the record's approved set already holds it), or a
   consent step at adoption; narrowing it needs an exact-path or per-method form
   in Kiro Crew's matcher. A fresh install asks for it in the normal permission
   dialog.
3. **The agent's progress tool is not listed for this copy.** The tool itself no
   longer lives in Kiro Crew: this app declares it (`agentTools`) and serves it
   (`POST /api/agent-tools`), exactly as the wheel copy does since Kiro Crew
   #32660, and the core lists and forwards it through the app-agnostic
   `apps/app_agent_tools.py` seam. But that seam reads the block only for a
   first-party app, `execution.builtin_app_names()`: a shipped manifest declares
   the name AND the built-in owns the installed slot. The App Kit spec says so in
   as many words ("a built-in's once its wheel copy is released by adoption,
   lists nothing"; `app-kit-platform.md` § 30.1), because `kirocrew-core` is
   auto-approved as a whole server and a non-first-party tool has no such
   grant. So after adoption, and on a fresh install, the agent is never handed
   `design_tweak_update_thread`, and the comment dots never turn done: the
   behaviour an adopted user has today would be lost. The old route (core's own
   tool, admitted on the internal secret for `/apps/design-tweak/api/thread`) was
   removed by the same change. Shipping a stdio `mcpServers` entry instead is
   refused by adoption (E10: the wheel built-in declares none), and its calls
   would ask for approval each time. Closing this needs the seam's trust to
   follow a record adopted from its pin (the same step the spec names for an
   adopted app's own MCP server), or a listing path that asks before each call;
   the spec records that as a maintainer's decision. Core's
   `data/mcp_tool_titles.json` row for the tool stays until the app leaves.
4. **Execution trust.** Closed by adoption: a built-in's spawned backend is
   admitted without a grant (`apps/backend.py`, `is_builtin_app`), and adoption
   writes the grant for this repository in the same transaction that moves the
   record (E6, `plan_grant`). A fresh install goes through the normal trust
   dialog, as every installed app does.
5. **Chat send transport.** The receipt contract of the dashboard's
   `chat-core/transport/sendTurn.ts` (deadline, refusal, unconfirmed) is restated
   in `ui/src/sendTurn.ts`, over a wire through the scoped client
   (`ui/src/api.ts`, `chatSendWire`). The SDK exports no send helper for an app
   that posts into a session of its own. Carried locally; it does not block the
   pin.
6. **Dashboard primitives.** `components/ui/dropdown-menu` (Radix), the
   `FolderBody` collapsible, `components/RadioChipGroup`, `hooks/usePointerDrag`
   and `utils/timeAgo` are not in the UI SDK: `ui/src/DropdownMenu.tsx` is a small
   local menu with the same call shape, items and keyboard handling;
   `ui/src/FolderBody.tsx`, `ui/src/RadioChipGroup.tsx` and
   `ui/src/usePointerDrag.ts` are copies; `ui/src/timeAgo.ts` rebuilds the helper
   on the SDK's `fmtRelative`. Carried locally; it does not block the pin.
7. **Styles.** The page keeps the built-in's Tailwind utility class strings. They
   render because the dashboard's stylesheet still carries them while the
   compiled built-in page ships with Kiro Crew. Removing that page from Kiro
   Crew needs the host to keep those utilities (or the bundle to carry its own
   CSS) first. It blocks the removal, not the pin.
8. **Core still names this app.** Kiro Crew #28355 made core independent of the
   app's code: `test/test_core_design_tweak_decoupling.py` pins that no core
   module or script imports it, and that the only core strings naming it are the
   `security_posture.py` rows for its three backend modules. What else still
   names it leaves with the built-in: `data/mcp_tool_titles.json` (gap 3),
   `docs/apps.md`, `website/src/apps/builtinRegistry.ts`,
   `website/src/components/appstore/appManifest.ts`, `website/eslint.config.js`,
   the capture and light-card scripts under `website/scripts/`, the
   `apps.designTweak.*` keys in the dashboard catalogs, the sample installed app
   in `tests_fixtures/rich/apps/design-tweak/`, and the core tests that list its
   spawns and paths (`test/spawn_audit_app_spawns.py`, `test/test_spawn_audit.py`,
   `test/test_builtin_app_platform_declarations.py`,
   `test/test_builtin_backend_address_reuse.py`, `test/test_nvm_xdg_call_sites.py`,
   `test/test_pem_scan_callers_linear.py`,
   `test/test_windows_extended_prefix_containment.py`,
   `test/test_windows_replace_retry_sweep.py`,
   `test/test_denied_root_parts_shared.py`). They go, or are re-pointed at a
   neutral fixture, when the built-in is removed. It blocks the removal, not the
   pin.
9. **Not in the catalog.** `KiroCrewApps/catalog/official-registry.json` has no
   `design-tweak` row; one (`type: git`, this URL, the pinned commit) is needed
   before the built-in can be removed.
10. **Store listing localization.** The catalog's publish step does not carry
    `l10n` yet, so a store row that is not installed shows the English fields. An
    installed copy is localized from its own manifest.
11. **Sidebar icon on a fresh install.** The Lucide `Paintbrush` glyph and the
    `/design-tweak` route are shown only for an adopted record (from Kiro Crew's
    pin). A fresh install from the App Store lives at `/apps/design-tweak` with
    the `iconPath` image.

## Wheel fixes ported since the snapshot

Every Kiro Crew commit that changed the wheel copy (the built-in's package, its
dashboard page or its tests) between `4bb268b4e9` and `6d07df11cf`:

| Kiro Crew | What changed there | Here |
|---|---|---|
| #28355 `5632b47b50` | Core made independent of the app; the website tests moved beside the page; the agent tool's data moved into the app | The test moves need nothing here. `designTweakBoundary.test.ts` tests the dashboard's own import boundary and has no counterpart (`ui/tests/hostBoundary.test.ts` is this repository's); its new `api.typedErrors.test.ts` is `ui/tests/api.typedErrors.test.ts`, without the case for the dashboard's tunnel-edge 429 relabel, which `ui/src/appApi.ts` does not carry |
| #28602 `2b6d7b726f` | A wrong-typed `config.json` field or draft `comments` reads as its default | `backend/request_state.py`; `tests/test_config_coercion.py` |
| #29267 `bcd9def964` | The state-file rename retries on Windows | `backend/request_state.py` through the host bridge (`replace_with_retry`) |
| #29673 `bf07772aad` | The project-path and dev-server URL fields carry an accessible name | `ui/src/DesignTweakPage.tsx`, two strings in every `ui/i18n/` catalog; `ui/tests/DesignTweakInputNames.a11y.test.ts` |
| #31871 `a47c2d4eff` | History and Dimensions expose `aria-expanded` | `ui/src/DesignTweakPage.tsx`; the History and Preview UI tests |
| #31445 `7aaf1b10d7` | The static server's credential scan uses the public `iter_credential_matches`; an unused import goes | `backend/_host.py`, `backend/preview_files.py`, `backend/server.py` |
| #32774 `273fa43631` | Preview / Edit is a named radio group | `ui/src/DesignTweakPage.tsx`, `ui/src/RadioChipGroup.tsx` (gap 6), one string per catalog; the Overlay and Preview UI tests |
| #32829 `db353b73d5` | The rail splitter drags by touch and pen (Pointer Events) | `ui/src/useDesignTweakPageState.ts`, `ui/src/usePointerDrag.ts` (gap 6); the Project rail UI test |
| #28541 `906be01163` | A static preview's `<base href>` and the no-entry page's links URL-quote folder names | `backend/preview_files.py`; `tests/test_backend.py` |
| #32660 `17024148f6` | The agent tool is declared in `app.json` (`agentTools`) and served at `POST /api/agent-tools` | `app.json`, `backend/http_api.py`, `tests/fixtures/builtin-app.json`; `tests/test_agent_tools.py` (gap 3) |

## UI

The page is `ui/src/`, ported from `website/src/apps/design-tweak/` with the same
markup, class strings and behaviour. `npm run build` in `ui/` writes the
committed `ui/dist/index.mjs`; CI rebuilds it and fails on a difference. Every
SDK name the bundle imports exists on a host before App Kit level 1, so it needs
no namespace feature checks (`tests/test_manifest_contract.py` reads the built
file).

| Built-in | Here |
|---|---|
| Plain same-origin `fetch` to this app's routes and the host chat endpoints (`api.ts:32`, `:37`, `:227`) | The host's scoped client, `useAppApi().raw`, bound once at the page root (`ui/src/appApi.ts`); a path outside `permissions.api` is refused in the browser |
| `api/apiError.toApiError` | `ui/src/appApi.ts` `ApiError`, with the server's own sentence |
| `chat-core/transport/sendTurn` (`api.ts:14`, `useDesignTweakPageState.ts:16`) | `ui/src/sendTurn.ts` (gap 5) |
| `react-router-dom` `useNavigate` (`useDesignTweakPageState.ts:14`) | SDK `useNavigate` (the one "open in chat" hop) |
| `components/Clickable`, `components/ErrorNotice`, `hooks/useImeGuard` | The same from `@kirocrew/app-sdk/ui` and `@kirocrew/app-sdk` |
| `components/ui/dropdown-menu`, `components/FolderBody`, `utils/timeAgo` | `ui/src/DropdownMenu.tsx`, `ui/src/FolderBody.tsx`, `ui/src/timeAgo.ts` (gap 6) |
| `i18n/t.i18nT` with `apps.designTweak.*` keys | `t()` in `ui/src/i18n.ts` over `ui/i18n/<locale>.json` (all 12 dashboard locales): the subtree (English from `en.json` plus `en.manual.json`), plus `pages.chatPage.send_failed`, `pages.chatPage.send_failed_with_error`, `api.client.accepted_body_unreadable` and `pages.chat.recoveryCard.no_response_returned` as `common.*`. Exact locale, then base language, then English |

## Tests

| Built-in test | Here | Change |
|---|---|---|
| `test/test_design_tweak_backend.py`, `_backend_dev_proxy.py`, `_backend_queue.py`, `_devproc.py`, `_discovery.py`, `_project_routes.py`, `_queue_routes.py`, `_relay_paths.py`, `test/design_tweak_backend_helpers.py` | `tests/test_backend.py`, `test_backend_dev_proxy.py`, `test_backend_queue.py`, `test_devproc.py`, `test_discovery.py`, `test_project_routes.py`, `test_queue_routes.py`, `test_relay_paths.py`, `tests/design_tweak_backend_helpers.py` | Import `backend`. `requires_symlinks` and `wait_until` come from `tests/helpers.py` (the same contracts as Kiro Crew's). The tests that start a real loopback server now also close it (`server_close()`), since this suite runs with warnings as errors. |
| `apps/builtins/design_tweak/tests/test_windows_support.py` | `tests/test_windows_support.py` | The host's `PortListener` and `address_covers_loopback` come from `tests/host_double.py` (the real ones in the `real-host` job). |
| `apps/builtins/design_tweak/tests/test_agent_api_tool.py` | `tests/test_agent_tools.py` | The declaration (equal to the built-in's; validated by the host's own reader and schema builder in the `real-host` job) and the backend route, plus the whole path onto a stored thread. The gateway-admission and proxy-header cases test Kiro Crew's own forwarding route and stay with it (`test/test_app_agent_tools.py`). |
| `test/test_design_tweak_config_coercion.py` | `tests/test_config_coercion.py` | Import `backend`. |
| (none) | `tests/test_no_host_imports.py`, `tests/test_host_stand_ins.py`, `tests/test_spawned_script.py`, `tests/test_manifest_contract.py` | The pinned, guarded host imports; every stand-in refuses and `/health` names the gaps; the backend started the way the gateway starts it (and with `-I -S`); the manifest's parity with the built-in, the bundle's imports, an adoptable tree. |
| `website/src/test/DesignTweakApiCov80.test.ts`, `designTweakDelivery.test.ts`, `DesignTweakHistoryCov80.test.tsx`, `DesignTweakOverlayBridgeCov80.test.tsx`, `DesignTweakPreviewCov80.test.tsx`, `DesignTweakProjectRailCov80.test.tsx`, `DesignTweakRequestsCov80.test.tsx`, `designTweakSlotContract.test.ts`, `designTweakStaysInApp.test.ts`, `website/src/apps/design-tweak/DesignTweakPage.owners.test.tsx` | `ui/tests/`, the same names and cases | Run by vitest on jsdom with SDK stand-ins (`ui/tests/stubs/`) and a `PointerEvent` polyfill (`ui/tests/setup.ts`; the dashboard's suite runs on happy-dom). The navigation case mocks the SDK's `useNavigate` instead of the router's. The `api.get` / `api.post` cases use a path inside `permissions.api`. Test-only type annotations were added where the stricter `tsc` here asked. |
| (none) | `ui/tests/i18n.test.ts`, `ui/tests/hostBoundary.test.ts` | Catalog coverage, placeholders and fallback; the declared grant, the scoped client's refusal, and the send wire's receipt reading. |

## Verified against a real gateway

Before publishing, this tree, installed from a clean clone, was run in an
isolated Kiro Crew gateway at the App Kit level-1 commit (`99161724c0`) with only
the built-in copy removed (a gateway that ships the built-in refuses a second
install under the same name): installed, trusted and enabled through the
dashboard API. The gateway spawned `backend/server.py` inside its sandbox with
`hostGaps: []`; the page loaded at `/apps/design-tweak`; a folder registered
through `POST /projects` previewed from the static loopback server; Edit mode
and a right-click opened the overlay's comment box; a sent request reached the
project's own chat session; and a live agent, once its session was trusted in
the chat, edited the project's CSS and posted its progress and "done" notes
through `design_tweak_update_thread` onto each comment's thread, after
which the page marked the comments done and reloaded the preview. That run
predates Kiro Crew #32660: the tool was then core's own, posting to
`/apps/design-tweak/api/thread`. On a Kiro Crew with #32660 that path is gone
and the declared tool is not listed for this copy (gap 3). The README
media (`docs/media/media.json`) are from that setup.

## What Kiro Crew keeps doing

The release that adds adoption still ships the built-in. A user's built-in
record moves onto this repository at the commit Kiro Crew pins, on the restart
after the tree is fetched and verified; a record that cannot move (offline, a
refused grant (gap 2), or the operator's admission policy) keeps running the
built-in copy, unchanged. The KiroCrewApps catalog gets a `git` row for this
repository at that same commit in the same release. Removing the built-in from
Kiro Crew is a later release, after gaps 1, 2, 3, 7 and 8 are closed.

## Release handoff: one commit for both pins

The adoption pin and the catalog row must name the same commit, and that commit
must be the ported tree. Do not compute the pin while gap 2 or gap 3 is open:
with gap 2 the release adopts nothing (E9 refuses), and with gap 3 an adopted
user's agent loses its progress tool. The pin's `minAppSdkLevel` must be at
least 2, the level whose host reads `agentTools`.

1. Call this repository's `main` head, a full 40-hex SHA, `C`
   (`git rev-parse HEAD`).
2. In the Kiro Crew release PR that adds adoption, run
   `python3 scripts/adoption_pin.py compute <this URL> C` and add the row it
   prints (commit, `treeSha256`, `archiveSha256`, `legacyNav`) to
   `src/kiro_crew/apps/adoption-pins.json`; then
   `python3 scripts/adoption_pin.py verify`. Until that row exists the release
   adopts nothing, and the catalog row must not be added.
3. Add the KiroCrewApps row for `design-tweak`: `"type": "git"`, this URL,
   `"ref": "C"`. Never a branch name or a placeholder.
4. Check that both files name the same `C`, and that GitHub serves it: in a
   fresh clone, `git fetch origin C` succeeds and `git cat-file -t C` prints
   `commit`.
5. The catalog PR stays a draft, labelled hold-for-release, until the Kiro Crew
   release that ships adoption is published.
