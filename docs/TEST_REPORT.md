# CanvasLab verification report

Updated 9 September 2026. macOS arm64, Node v25.8.1, Chromium 153.0.8010.12. The production-mode local preview is **http://localhost:3100**; port 3000 serves another application. Tests use the real Supabase project **Khalifah Internal Tools** and exact schema **`"Khalifah Board"`**. They create private QA accounts with random passwords and never send email.

## Vercel deployment follow-up

Production is live at https://khalifah-board.vercel.app. After splitting the Node entrypoint and adding the private Supabase relay, 56 unit tests, lint and build passed. Three browser scenarios and all five WebSocket security checks were rerun successfully against production. [Deployment evidence](../artifacts/vercel-deployment.json) and [hosting details](VERCEL_DEPLOYMENT.md) record the exact scope. Distinct-instance stress testing and a timed maximum-duration expiry were not performed.

## Recorded results

| Check | Result | Evidence |
|---|---|---|
| Unit tests | **56 passed / 7 files** | Model, CSV, geometry, routing/cache/rounded bends, rotated resize, service boundary/assets |
| Strict typecheck | **Passed** | `npm run typecheck`, including the seed script |
| ESLint | **Passed** | `npm run lint` |
| Production build | **Passed** | `npm run build`; served by `PORT=3100 npm start` |
| Browser suite | **9 passed, 0 skipped, 0 flaky** | [e2e-results.json](../artifacts/e2e-results.json), 69.07 seconds; pointer gestures, real backend and distinct browser contexts |
| Project workflow browser check | **1 passed separately, 0 skipped, 0 flaky** | [project-workflow-results.json](../artifacts/project-workflow-results.json), 12.79 seconds |
| Database integration | **11 passed** | [integration-results.json](../artifacts/integration-results.json); latest full rerun on 9 September |
| Direct WebSocket security | **5 passed** | [ws-security.json](../artifacts/ws-security.json) |
| Gateway restart durability | **Passed** | [restart-persistence.json](../artifacts/restart-persistence.json); two scene objects and one PNG |
| Browser-close recovery | **Passed** | Included in the browser suite; server absence before close and server presence after recovery asserted |
| Safe seed command | **Passed** | Four editable example boards in a private QA project; credentials supplied from the isolated smoke account |
| Production dependency audit | **0 vulnerabilities reported** | `npm audit --omit=dev --audit-level=moderate` |
| Supabase schema verification | **19 tables, all RLS enabled** | Read-only catalog query against the named project on 9 September |
| Docker image/container execution | **Not run** | Docker CLI is present, but the Colima daemon socket and Compose subcommand are unavailable. Verified local setup is provided. |

## Browser behaviors actually exercised

- two real browser contexts: collaboration, local undo, offline reconciliation and access revocation (13.50 s).
- templates, real comments, image upload, freehand, pages and exports (14.68 s).
- pending offline edit recovers after completely closing and reopening the browser (5.73 s).
- registration, dashboard, board, real sticky text and persistence (5.27 s).
- drag a sticky note from the toolbar, edit it, and recover it after reload (4.45 s).
- click Section and draw a frame with the pointer-defined dimensions (4.19 s).
- drag Shapes from the toolbar and connect a selected shape from its outside edge (8.28 s).
- frame toolbar drag, smooth pointer zoom, pan and seamless page location (3.96 s).
- shape palette drag, edge resize and quick-connect to the nearest shape (7.79 s).
- separate project workflow: create a project, move via menu, move back via sidebar drag/drop, require access confirmation, compare scene and reopen the unchanged board URL (12.00 s).

Console/page errors are asserted in the sticky/multiplayer/connector tests; the benchmark and final seeded visual capture also reported none. This is not an exhaustive accessibility or cross-browser audit. During development, duplicate Vite processes produced stale dependency-cache 504s and a blank page. The conflicting processes were stopped and the final suite ran against the production build. Tests also caught a palette intercepting its own drop, lost page camera state, and save status hidden at an intermediate viewport; these were corrected before the final browser run. Earlier failed traces are not used as final pass evidence.

## Database and authorization

- Workspace → projects → independent boards; private search isolation: Passed (1420 ms).
- Persistent scene, server verified author, reconnect merge: Passed (848 ms).
- Viewer/commenter deny API writes; editor grant scoped to one board: Passed (4232 ms).
- Concurrent Y.Text/style converge on server; private favorites and Recent: Passed (1812 ms).
- Assets private, real type validation, persistent comments/replies/resolve: Passed (2534 ms).
- Move retains ID, data, comments, assets; confirms permission change: Passed (1683 ms).
- Duplicate remaps objects and connectors; snapshot restores independent board: Passed (1346 ms).
- Link access default viewer, revoke link, owner session preserved: Passed (2804 ms).
- Shared timer transitions, facilitator enforcement, vote privacy and quota: Passed (10073 ms).
- Editable export/import remaps references and rejects corrupt bundle: Passed (1333 ms).
- Trash project restores only its batch; revoked access blocks future writes: Passed (5210 ms).

Direct WebSocket tests additionally bypass the UI: viewer scene writes return 403 and close the connection; forged user identity and chat timestamps are replaced by authenticated/server values; revoked editor and trashed-board sockets close; hostile Origin is rejected. Direct commenter **API** denial is covered; a separate direct commenter socket case and exhaustive thumbnail/export attack combinations remain unexecuted.

All app tables are private to `"Khalifah Board"`, with RLS enabled and no direct grants to `anon` or `authenticated`. The API performs authorization through its server-owned database connection. The advisory `rls_enabled_no_policy` is expected for that deny-by-default layout; [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Pre-existing findings in unrelated schemas were not altered. This is not a formal penetration test.

## Actual large-board measurement

Single local Chromium run, 1440 × 900; 1,000 stickies and 100 connectors; 586,851-byte Yjs document. Values include automation, rendering and network overhead, and are not production guarantees.

| Measurement | Recorded value |
|---|---:|
| Initial board load | 2.216 s |
| Pan automation action (30 steps) | 585.8 ms |
| Wheel zoom dispatch | 35.7 ms |
| Drag through server confirmation | 1.790 s |
| Text edit through server confirmation | 1.423 s |
| Frame interval, mean | 18.35 ms |
| Frame interval, p95 | 33.30 ms |
| Longest sampled frame | 50.00 ms |

[Raw benchmark](../artifacts/benchmark.json), [large-board screenshot](../artifacts/benchmark-1100.png). Tiny text/table details and shadows are omitted below 28% zoom, viewport culling remains enabled, and unrelated routes are cached during object dragging. A prior run before the drag-route cache is retained as [benchmark-before-drag-cache.json](../artifacts/benchmark-before-drag-cache.json). This does not establish sustained 60 FPS, multiple-user scale, memory bounds or performance on physical tablets.

## Required scenarios 01–36

A **Partially verified** entry records the verified subset and the remaining step; it is not a complete acceptance pass. API/model verification is explicitly distinguished from UI verification.

| ID | Requested scenario | Status | Evidence / remaining step |
|---|---|---|---|
| 01 | Fresh install → register/login → workspace → project → board → editor | Partially verified | Real UI registration → onboarded workspace/project → new board → editor passed. A clean-machine install was not repeated. |
| 02 | Two projects, multiple boards, exact hierarchy | Passed | Real integration creates destination project/boards; private hierarchy assertions and current project-view screenshot. |
| 03 | Open each board; independent content | Partially verified | IDs/reference independence verified by API/model; opening each copy and editing it through current UI pending. |
| 04 | Rename project/board; stable URL and remote metadata | Partially verified | Board rename/move preserves ID; two-browser project/board rename propagation pending. |
| 05 | Move by menu and sidebar drag/drop preserving all data | Passed | Both UI routes passed with access confirmation, unchanged URL and identical scene. API separately verifies retained assets and comments. |
| 06 | Duplicate; editing copy does not alter source | Passed | Unit independent-template/object clone assertions; API fresh object/connector IDs. Full board UI copy-edit is an additional pending check. |
| 07 | Favorites and Recent isolated per user | Partially verified | Favorite isolation asserted; Recent written but complete cross-user Recent isolation not asserted. |
| 08 | Trash populated project and restore correctly | Passed | Integration verifies matching trash batch restores while independently trashed board stays deleted. |
| 09 | Search/counts/thumbnails/shared metadata do not leak | Partially verified | Private dashboard/project/board isolation verified; exhaustive counts/thumbnail/Shared view assertions pending. |
| 10 | Sticky multiline, color, resize, refresh | Partially verified | Multiline sticky from toolbar and persistence passed. Shape resize passed separately; combined sticky-color-resize/reload case remains unexecuted. |
| 11 | Pan/zoom then select/drag/resize/edit without drift | Partially verified | Pointer-centered zoom, direct pan, page camera restoration, object drag and resize passed. Rotated resize has world-anchor unit checks; full IME/edit sequence after every transform not exhaustive. |
| 12 | Connect shapes; move and resize; keep endpoints attached | Partially verified | Browser side-handle connection follows moved target after reload. Unit checks cover both endpoints under move/resize/rotation; complete two-shape resize UI sequence not repeated. |
| 13 | Duplicate/copy-paste object sets and connectors | Partially verified | Unit/API duplicate remapping passes; native clipboard route pending. |
| 14 | Group/ungroup and move sections with valid membership | Partially verified | Group identity remap verified; current group/section interactions pending. |
| 15 | Delete/undo object types without orphan references | Partially verified | Unit detach and local-undo tests pass; multi-type UI delete/undo sequence pending. |
| 16 | All page operations; collaborator active-page deletion | Partially verified | Retained browser run creates/duplicates/reorders; unit last-page safety passes. Two-user deletion pending. |
| 17 | IME, selection, clipboard, Escape, shortcut isolation | Partially verified | Text controls/shortcuts present; physical IME/composition and native clipboard checks pending. |
| 18 | Tables, CSV round-trip, mind map, freehand | Partially verified | CSV unit round-trip and real browser pen stroke pass; table/mind-map UI manipulation pending. |
| 19 | Two browser accounts edit and synchronize | Passed | Two isolated browser accounts add objects and observe each other’s changes in the current full browser run. |
| 20 | Concurrent same-object text/style convergence | Passed | Unit and real-Supabase concurrent Y.Text/style assertions pass. Same-field conflict semantics documented. |
| 21 | User A undo retains B's work | Passed | Browser A undo/redo leaves B’s work present; model tests also isolate local history. |
| 22 | Offline scene edit and reconnect converge | Passed | Real browser goes offline, edits, reconnects and converges in the second browser. |
| 23 | Server-saved → restart → reopen content/assets | Passed | Production gateway fully stopped and restarted with a different PID; authenticated browser reopened identical scene and exact PNG bytes. restart-persistence.json. |
| 24 | Browser close/reopen with pending local changes | Passed | Persistent Chromium profile closed with unsaved offline text; server lacked that text before close. Reopening restored it from IndexedDB and persisted it to Supabase. |
| 25 | Viewer/commenter UI and direct API/WS write denial | Partially verified | Viewer/commenter API and direct viewer WS rejection pass. Complete UI + direct commenter WS scenario pending. |
| 26 | No-access board/assets/thumbnail/export/search denial | Partially verified | Board/asset/dashboard isolation passes; full thumbnail/export attack matrix pending. |
| 27 | Revoke online access; reject sync and future access | Passed | Direct active-editor socket closes and subsequent API writes denied. |
| 28 | Move between memberships; confirmation/effective roles | Partially verified | Missing confirmation rejected and move persists. Full differing inherited membership combinations pending. |
| 29 | Trash active board stops writes through old connection | Passed | Direct owner WebSocket closes after trash; trashed board API access denied. |
| 30 | Image upload, reload, second context | Passed | Retained real browser picker/reload plus integration second-user authorized asset retrieval. |
| 31 | Comment, reply, resolve, reopen, persistent sync | Passed | API lifecycle and retained browser create/resolve/reopen pass; live cross-browser comment propagation not separately measured. |
| 32 | Two-user timer/voting quota/facilitator/privacy/results | Passed | Dedicated real database scenario checks all listed server controls. |
| 33 | PNG/SVG/editable exports; editable import elsewhere | Passed | Real browser downloads plus API destination import with remapped editable objects/assets. |
| 34 | Template produces independent editable board | Passed | Seven template unit variants verify unique object IDs and unchanged second copy after first edit. |
| 35 | Actual large-board benchmark | Passed | 1,000 objects + 100 connectors measured in actual Chromium; benchmark.json includes timing and environment. |
| 36 | Corrupt import, oversize upload, failures, missing asset, permission denied without blank UI | Partially verified | Invalid bundle/raster/request unit/API errors verified; complete browser failure-state matrix pending. |


## Real screenshots and artifacts

- [Workspace dashboard](../artifacts/dashboard-workspace.png), [project boards](../artifacts/project-boards.png), [refined canvas](../artifacts/refined-canvas.png), [shape palette](../artifacts/shape-palette.png).
- [Blank editor](../artifacts/blank-editor.png), [sticky note](../artifacts/sticky-editor.png), [sample board](../artifacts/sample-board.png), [quick connectors](../artifacts/quick-connect-shapes.png).
- [Share](../artifacts/share-dialog.png), [comments](../artifacts/comments.png), [multiplayer](../artifacts/multiplayer-editor.png), [page/camera navigation](../artifacts/smooth-canvas-navigation.png).
- [1280 × 800](../artifacts/editor-1280.png), [1024 × 768](../artifacts/editor-tablet.png), [server restart](../artifacts/server-restart.png), [device recovery](../artifacts/device-recovery.png).
- Real exported [PNG](../artifacts/qa-export.png), [SVG](../artifacts/qa-export.svg), [editable bundle](../artifacts/qa-export.canvaslab).

## Remaining limitations and unexecuted checks

Unified group resize/rotation is not implemented; group/section movement is. Tables merge their cells as one field rather than separate per-cell CRDTs. Local text selection/caret does not transform against simultaneous remote text edits. Arbitrarily enclosed connector endpoints cannot always be routed around obstacles. Physical IME, touch/trackpad, full clipboard paths, screen-reader accessibility, every failure UI, and the complete 36-scenario sequence remain beyond the recorded checks. No native `.fig`/`.jam` import, pressure pen, SSO, email recovery provider or multiple-instance pub/sub is supplied. Docker runtime verification remains blocked by unavailable local runtime components; Node local setup is verified.

## Reproduce

```sh
npm ci
npm run build
PORT=3100 npm start
# In another terminal:
npm run typecheck
npm run lint
npm test
BASE_URL=http://localhost:3100 npm run test:integration
BASE_URL=http://localhost:3100 npm run test:ws
BASE_URL=http://localhost:3100 npm run test:e2e
BASE_URL=http://localhost:3100 npm run benchmark
npm run test:restart
```

The restart test chooses its own free port and owns both gateway processes, so it does not stop the user’s preview or other applications. The Playwright HTML report is overwritten by each run; the checked-in sanitized JSON artifacts identify the actual retained pass scopes.
