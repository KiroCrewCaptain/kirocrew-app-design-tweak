# Porting notes: built-in → external app

This repository was ported from Kiro Crew's built-in app at
`src/kiro_crew/apps/builtins/design_tweak/` (KiroCrew `main` at `4bb268b4e9`),
its dashboard page at `website/src/apps/design-tweak/`, its store art at
`website/public/app-assets/design-tweak/`, and its tests: the one under the app's
own `tests/` that tests the app (`test_windows_support.py`), the nine
`test/test_design_tweak_*.py` files with their shared
`test/design_tweak_backend_helpers.py`, and the ten website tests named in
[Tests](#tests).

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
| A spawned backend | Still a spawned backend, **not** `backend.hooks` | Deliberate. This backend starts the user's own dev server, binds its own loopback preview servers and relays their WebSockets: in-gateway hooks would run all of that inside the gateway process. The launcher wraps an app backend in the OS sandbox and the cgroup ceiling at spawn (`apps/backend.py`), and keeping the process also keeps the proxy path, so `/apps/design-tweak/api/thread` (the agent's progress route, below) and the page's backend paths are the built-in's. The App Kit level-1 seams (`ctx.require_owner`, `ctx.embed`, `ctx.sdk_level`) are hook-context members and have no consumer in a spawned backend. |
| `from kiro_crew.apps.builtins.design_tweak.backend import dev_preview, http_api, preview_files, request_state` (`backend/server.py:33-38`) | Relative imports, with a script-form fallback (`backend/server.py:33-45`) | The gateway runs a file entry as a script (`python backend/server.py`, working directory the app root), where there is no package; the tests import it as the `backend` package. The fallback adds the script's own directory to `sys.path`, so an isolated launch (`python -I`) finds the siblings too (`tests/test_spawned_script.py`). |
| `from kiro_crew... import ...` at module top (`backend/server.py:39-65`, `backend/preview_files.py:14-15`, `backend/request_state.py:23`) | One feature-detected host bridge, `backend/_host.py` | See [Host bridge](#host-bridge-private-kiro-crew-imports). |
| `sel().log_api_access(..., source="builtin-app")` (`backend/http_api.py:90`) | `source="app"` | This copy is an installed app and says so, with the source the host's own app audit SDK writes. |
| `/health` | Adds `hostGaps: []` | Names any host capability this process could not import, so an operator can see why something is refused. |
| `handle = log.open("wb")` passed to the dev server and never closed (`backend/server.py:856`) | Opened in a `with` block around the spawn (`backend/server.py`, `_start_dev_proc`) | The child gets its own copy of the descriptor; the built-in kept one open file per dev server for the backend's lifetime. Found by this repository's tests, which run with warnings as errors. |
| `iconUrl` / `heroImage*` / `screenshots` as absolute `/app-assets/...` files (`app.json:5`, `:55-61`) | `iconPath` / `heroImage*` / `screenshots` as repo-relative PNGs under `assets/` | A registry app's art is repo-relative, and the catalog's publish step refuses SVG for a non-builtin source. The PNGs were rendered from the built-in SVGs (the icon at 512×512 on an opaque tile with its `--ico-a` / `--ico-b` tokens resolved to fixed pink and violet; heroes at 1200×675 and detail banners at 1200×288, with transparent corners). The original SVGs are kept beside them. The store screenshot is the README's light hero. |
| `ui.pages` `[{"route": "/design-tweak", "icon": "Paintbrush"}]`, page compiled into the dashboard (`app.json:31`, `website/src/apps/builtinRegistry.ts:79`) | `ui.entry: "dist/index.mjs"` (a committed ESM bundle built from `ui/src/`), `ui.pages` `[{"route": "/apps/design-tweak", "label": "Design Tweak"}]`, no `icon` | An installed app ships its page as a bundle AppHost loads. The legacy `/design-tweak` route, nav id and `Paintbrush` glyph of an ADOPTED record come from Kiro Crew's adoption pin (`legacyNav`), never from this manifest, so a fresh install cannot claim them. |
| `permissions.api` `["/apps/design-tweak/api", "/apps/design-tweak/api/*"]` (`app.json:22-25`) | The same two, plus `"/api/chat"` and `"/api/chat/slots"` | The page creates and binds its per-project chat session, reads its transcript to confirm delivery, and sends the batch, all on the host's chat endpoints. The compiled built-in page called them as dashboard code; a bundle calls through the scoped client, which refuses an undeclared path. This is a widening (gap 2). |
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
`4bb268b4e9`, and the `test` job against `tests/host_double.py`.

| Built-in import | Use | Without it |
|---|---|---|
| `kiro_crew.apps.proxy_auth.verify_proxy_request` | The gateway's signature on every proxied request | Every route but `/health` answers 401 (this one IS public: App Kit `api-reference.md`, "Proxy Authentication") |
| `kiro_crew.security.{is_sensitive_path, path_contains_sensitive, DENIED_ROOT_PARTS}` | The shared credential fence, on every project root and served file | Every path is sensitive: no project registers and nothing is served |
| `kiro_crew.hooks.{safe_read_file_bytes_nolink, FileTooLargeError}` | The link-safe, inode-pinned read behind the static preview and `package.json` | Every read is refused |
| `kiro_crew.security.{redact_credentials, redact_exfiltration_urls}` | The redaction floor on comment and thread text, both ways | The text is withheld, never shown unredacted |
| `kiro_crew.platform.context.redact_via_context` | The companion-aware redaction of a failed dev server's log tail | The tail is withheld |
| `kiro_crew.security.redaction_patterns._credential_matches` (built-in: `kiro_crew.security.redaction._credential_matches`, `backend/preview_files.py:15`) | The static server's refusal to serve a text file carrying a key | Every text file reads as carrying one: nothing textual is served |
| `kiro_crew.sel.sel` | The security event log | The audit line goes to this process's own log |
| `kiro_crew.env.nvm_version_bin_dirs` | The nvm install layout, to find `npm` / `pnpm` / `yarn` | Only the fixed install directories are searched |
| `kiro_crew.platform_compat.{find_port_listeners, address_covers_loopback, get_ppid, kill_process_tree, trusted_system_bin, is_link_or_junction, strip_extended_length_prefix, IS_POSIX, IS_MACOS, SIGTERM, SIGKILL, CREATE_NEW_PROCESS_GROUP}` | Listener enumeration, process-tree ownership and kill, the trusted `lsof` / `osascript`, link checks | No foreign server is adopted, no process is claimed as ours, no system tool is run; the dev server this backend started is still stopped through its own process group |
| `kiro_crew.subprocess_utf8.UTF8_TEXT` | Text mode for child processes | Stated in `backend/_host.py` (three keyword arguments) |

## Remaining gaps

1. **A public backend seam for spawned app processes** (`backend/_host.py`). The
   names above are a Kiro Crew change away from a published module, for example
   `kiro_crew.apps.sdk.backend` with the credential fence, a safe read, the
   redaction floor, the event log and the process helpers. One of them is
   underscore-private (`_credential_matches`, built-in
   `backend/preview_files.py:15`). Until then a release that moves one makes this
   app refuse that capability (closed, reported in `/health`), not break open.
   Kiro Crew's `security/paths.py:225` comment names this app as a reader.
2. **The chat grant widens `permissions.api`.** Adoption holds back a grant the
   built-in did not declare and refuses the move as `permission_widening`
   (`apps/builtin_adoption_checks.py`, `permission_refusal`, in the adoption PR),
   so an existing user's record would stay on the built-in. The built-in page
   reached `/api/chat` and `/api/chat/slots/*` as compiled dashboard code with no
   declaration (`website/src/apps/design-tweak/api.ts:219-232`, `:367`). Closing
   this needs the adoption pin to carry the grant the compiled page already
   exercised, or a consent step at adoption. A fresh install asks for it in the
   normal permission dialog.
3. **The agent's progress tool lives in Kiro Crew and names this app.** The
   agent reports per comment through `design_tweak_update_thread`, a tool on
   Kiro Crew's own MCP server (`mcp_tools/apps.py:172`, `:602`, `:779-821`,
   `:1177`; schema `validation_parts/app_schemas.py:101-132`,
   `validation_parts/server_registries.py:222`; title
   `data/mcp_tool_titles.json:81`), admitted on the internal secret for exactly
   `/apps/design-tweak/api/thread` (`dashboard/server_internal_paths.py:410-438`,
   `apps/routes_proxy.py:115`). It works for this copy because the name and the
   proxy path are the built-in's (checked against a live gateway, below), but it
   is core code keyed by an app name. It needs a generic, app-agnostic seam (an
   app-declared agent route, `docs/request-for-change/rfc-app-agent-routes.md`, or
   app-owned MCP tools with an app-scoped credential) before the core tool can
   go; `skills/visual-edit/SKILL.md` names the tool and changes with it.
4. **Execution trust.** A built-in's spawned backend is admitted without a grant
   (`apps/backend.py:463-473`, `is_builtin_app`). This copy's backend starts only
   when the operator trusts it (`agent.apps_trusted`, or
   `agent.apps_allow_third_party`). For an existing user, Kiro Crew's adoption
   writes that grant for this repository in the same transaction that moves the
   record; a fresh install goes through the normal trust dialog.
5. **Chat send transport.** The receipt contract of the dashboard's
   `chat-core/transport/sendTurn.ts` (deadline, refusal, unconfirmed) is restated
   in `ui/src/sendTurn.ts`, over a wire through the scoped client
   (`ui/src/api.ts`, `chatSendWire`). The SDK exports no send helper for an app
   that posts into a session of its own.
6. **Dashboard primitives.** `components/ui/dropdown-menu` (Radix), the
   `FolderBody` collapsible and `utils/timeAgo` are not in the UI SDK:
   `ui/src/DropdownMenu.tsx` is a small local menu with the same call shape,
   items and keyboard handling; `ui/src/FolderBody.tsx` is a copy;
   `ui/src/timeAgo.ts` rebuilds the helper on the SDK's `fmtRelative`.
7. **Styles.** The page keeps the built-in's Tailwind utility class strings. They
   render because the dashboard's stylesheet still carries them while the
   compiled built-in page ships with Kiro Crew. Removing that page from Kiro
   Crew needs the host to keep those utilities (or the bundle to carry its own
   CSS) first.
8. **Core still names this app.** Besides gap 3: `security_posture.py:945-947`
   (posture sinks under the built-in's path), `docs/apps.md:62`,
   `website/src/apps/builtinRegistry.ts:79`,
   `website/src/components/appstore/appManifest.ts:196-205`,
   `website/eslint.config.js:231`, `website/scripts/capture-app-store-gallery.mjs:47`,
   `website/scripts/check-kiro-light-cards.mjs:111`, the `apps.designTweak.*` keys
   in the dashboard catalogs, the sample installed app in
   `tests_fixtures/rich/apps/design-tweak/`, and the core tests that list its
   spawns and paths (`test/spawn_audit_app_spawns.py`, `test/test_spawn_audit.py`,
   `test/test_builtin_app_platform_declarations.py`,
   `test/test_builtin_backend_address_reuse.py`, `test/test_nvm_xdg_call_sites.py`,
   `test/test_pem_scan_callers_linear.py`,
   `test/test_windows_extended_prefix_containment.py`,
   `test/test_denied_root_parts_shared.py`). They go, or are re-pointed at a
   neutral fixture, when the built-in is removed. The built-in's own
   `tests/test_agent_api_tool.py` tests the core tool of gap 3 and stays with it.
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
| `apps/builtins/design_tweak/tests/test_agent_api_tool.py` | Not carried | It tests Kiro Crew's own `design_tweak_update_thread` tool and its internal-path admission (gap 3); it stays with that code. |
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
through `design_tweak_update_thread` onto each comment's thread (gap 3), after
which the page marked the comments done and reloaded the preview. The README
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
must be the ported tree.

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
