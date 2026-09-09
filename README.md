# CanvasLab · Khalifah Board

A working collaborative whiteboard built for **Workspace → Project → Board**. Click a project to see its boards; click a board to open the canvas. There are no folders. Pages, sections and groups are internal editor features.

The application uses the existing Supabase project **Khalifah Internal Tools** (`txsyyhcrtasrqodtvpvn`, Singapore). All 19 application tables live in the exact, case-sensitive PostgreSQL schema **`"Khalifah Board"`**. Existing application schemas were not modified. The schema is private, RLS is enabled, and `anon`/`authenticated` have no direct table privileges. A session-authenticated Edge Function is the authorization boundary.

## Vercel

Production project: [khalifah-board](https://khalifah-board.vercel.app). See [deployment configuration and verification](docs/VERCEL_DEPLOYMENT.md). Server-only realtime credentials are configured in Vercel environment variables; local single-server development can run without them.

## Run

Uses Node 24.x on Vercel (local development also tested on Node 25.8.1) and npm. The configured Supabase API is already deployed.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The verified preview in this workspace currently runs at [http://localhost:3100](http://localhost:3100), since another application occupies port 3000. Use `PORT=3100 npm run dev` or `PORT=3100 npm start` to select that port. Register an account; onboarding creates a personal workspace and initial project. No email delivery, email verification, default password or paid license key is required. Create a blank board or select one of seven editable templates.

```sh
npm run build
npm start
# alternatively, with Docker installed:
docker compose up --build
```

The HTTP API and WebSocket URLs are relative to the current host, so other devices can connect to the server’s address on port 3000. Bindings use `0.0.0.0`. Docker contains the Node gateway and frontend; user data and assets remain in Supabase across container/server restarts. No local database/asset volume is needed with this architecture. Docker configuration is provided; see test report for actual execution status.

## Two users

1. Register in a normal browser window and create a board.
2. Register a second account in an incognito window or on another device connected to this server.
3. The board owner opens **Share**, enters the second account’s email, selects **Can edit**, and clicks **Give access**.
4. Open the same `/board/<id>` URL in both contexts. You can also create a registered-account share link. Links default to viewer; owner can revoke them.
5. Add/edit objects in either window. Cursors, selections, content and metadata update across the WebSocket server. Click an avatar to follow; pan or leave follow mode to regain your own camera.

## What is implemented

- Accounts with salted PBKDF2-SHA256 passwords, opaque hashed sessions, HttpOnly/SameSite cookies, logout, account-specific offline cache.
- Workspace switching, membership, private/shared projects, project descriptions/icons/colors, direct board grants and revocable links.
- Board creation/templates, rename, duplicate with remapped IDs/assets, move by menu or sidebar drop, favorites, Recent, search/sort, grid/list, batch-aware Trash/restore.
- Infinite canvas, mouse/touch pan and pinch, zoom to pointer, fit, selection/marquee, drag/resize/rotate, snapping, lock, z-order, align/distribute/tidy, group/ungroup, sections, keyboard shortcuts.
- Sticky notes, text, five basic shapes, straight/elbow connectors bound to transformed object boundaries, pen/highlighter/eraser, stamps, images, editable tables/CSV, mind map child/sibling/layout.
- Pages create/rename/reorder/duplicate/delete, object outline/search, comments/replies/resolve/reopen, server-time workshop timer, private quota-enforced votes with aggregated history.
- Yjs per-object maps and `Y.Text`, local Yjs undo, WebSocket identity validation, IndexedDB recovery/reconnect, server-confirmed save status.
- PNG/SVG export beyond the viewport; editable `.canvaslab` export/import with assets; snapshots that restore to new boards.

See [feature matrix](docs/FEATURE_MATRIX.md) and [test report](docs/TEST_REPORT.md) for evidence and remaining limitations. This is an independent implementation, not proprietary Figma code or native `.fig`/`.jam` support.

## Refined canvas interactions

Drag a sticky, shape, text or section directly from the bottom toolbar; palette shapes also support dragging. Click Section (Shift+S) and drag on the canvas to choose its size. Hover a shape’s side to reveal a connector handle, then drag to a highlighted nearby shape. Clicking a handle connects the nearest suitable shape in that direction or creates a connected sibling. Ctrl/Command+wheel zooms around the pointer, Space+drag pans, and the upper-left page menu remembers each page’s camera during the session. Optional grid snapping remains in the board menu; normal dragging uses small alignment guides.

[Research and behavior details](docs/FIGJAM_UX_RESEARCH.md). Actual final verification: 56 unit tests, 10 browser scenarios (9-suite run plus 1 separate project workflow), 11 real database integration scenarios, 5 WebSocket security checks, and a gateway restart persistence check. See the test report for limits and measured performance.

## Safe example data

Set `CANVASLAB_SEED_EMAIL` and `CANVASLAB_SEED_PASSWORD` to credentials you choose, then run `BASE_URL=http://localhost:3100 npm run seed`. It creates a private **Example workshops** project with Digital Product, Team canvas, Business process, and Customer journey boards. It reuses the same account/project and skips existing named examples on repeat runs. It never prints the password and provides no fixed shared credentials. This path was exercised with an isolated QA account.

## Architecture

`React + TypeScript + Vite` → same-origin `Node/Express` HTTP and WebSocket gateway → Supabase `canvaslab-api` Edge Function → PostgreSQL **`"Khalifah Board"`**.

The SVG/DOM canvas is owned by this application. It uses `foreignObject` for readable text and table cells, and a transformed DOM textarea for selection/IME. Camera, active tool, selection and panels stay local. At less than 28% zoom, small text/table details and note shadows are omitted from rendering; the document remains intact and details return when zoomed in. During dragging, attached connectors follow the object immediately and unrelated routes are recalculated on commit. Yjs objects are separate `Y.Map` records; their text is `Y.Text`. Pages are shared maps. An object's coordinates are world coordinates; section/group links are IDs and their members also use world coordinates. This explicit model does not use parent-relative transforms.

The gateway serializes writes per board and waits for PostgreSQL acknowledgement before broadcasting the canonical update. PostgreSQL row locks serialize document merge/compaction. Append-only Yjs updates preserve clocks and deletion sets; compaction after 250 entries stores the full CRDT state. Different fields merge independently; same-field concurrent writes use Yjs’s deterministic conflict resolution. Text uses collaborative insertion/deletion. Undo tracks only local origins; drag operations commit a single transaction.

**Saved** means all queued local updates have received a successful server response after the database transaction. Changes are batched for 100 ms for transport, but IndexedDB continuously retains document updates; it is not the primary database. Reconnect exchanges a state vector and merges missing content. Transient save failures reconnect. Revocation/trash closes active connections and disables editing. Unauthorized offline edits are rejected; the cached board is cleared. The application does not guarantee preservation after cache eviction or disk failure.

Presence is ephemeral, throttled and stamped with authenticated identity. It is never appended to the document or database. Private votes never enter Yjs or other participants' responses before the session ends. Cursor/selection broadcast is disabled during known active voting sessions. Quotas apply to application accounts, not verified unique humans. Workshop facilitator or board owner controls timer/session transitions.

### Data model

SQL tables: accounts, sessions, workspaces, workspace_memberships, projects, project_memberships, boards, board_grants, share_links, link_memberships, document_updates, object_authors, assets, comments, workshops, votes, snapshots, preferences, rate_limits.

Pages, objects, connector bindings and group/section references live inside the persisted Yjs document, not independent SQL tables. `object_authors` makes displayed creator names authoritative. Assets are private PostgreSQL `bytea`, retrieved only after board access checks. Workspace/project/board ownership, share tokens and votes cannot be changed by document updates.

### Effective permission

Roles rank **owner > editor > commenter > viewer**. Effective board role is the strongest applicable project, direct board grant or active link grant. A lower board grant cannot reduce stronger project access. Workspace owners administer every project; other workspace roles apply only to projects with `is_private=false`. Private projects require project membership. Direct board sharing reveals that board without revealing its parent’s name or sibling boards.

| Operation | Owner | Editor | Commenter | Viewer |
|---|---|---|---|---|
| Read/export accessible board | Yes | Yes | Yes | Yes |
| Edit scene, rename/trash board, assets, snapshots | Yes | Yes | No | No |
| Comment/reply | Yes | Yes | Yes | No |
| Resolve any thread | Yes | Yes | Own only | No |
| Share/revoke board access | Yes | No | No | No |
| Start workshop | Yes | Yes | No | No |
| Control running workshop | Yes | Facilitator only | No | No |
| Cast vote | Yes | Yes | Yes | No |
| Move/restore/create board | Editor+ in source/destination project as applicable |
| Project membership/trash/restore/visibility | Project owner or workspace owner |
| Workspace administration/membership | Workspace owner |
| Create project | Workspace editor or owner |

A move changes only `project_id`, preserving board ID/URL, content, assets, comments and snapshots. Project-inherited access changes; direct board grants and accepted share links remain. The move confirmation states this. Duplicate and snapshot restore remap IDs, groups, pages, connector and asset references into an independent board. They do **not** copy comments, private votes, active workshop sessions, access grants or version history.

Trash uses operation IDs. Restoring a project restores only the boards trashed in the same operation; a board already trashed independently remains trashed.

## Configuration and deployment

Only public endpoint configuration appears in `.env.example`. No database password or service key is embedded in frontend or local source. Supabase supplies `SUPABASE_DB_URL` inside the Edge Function. Each request closes its single connection; the Node gateway limits concurrent upstream calls to protect the existing shared database.

For a different Supabase installation, apply `supabase/migrations` in order and deploy the `supabase/functions/canvaslab-api` entrypoint together with `server/service.ts` and its Deno import map. Keep JWT verification disabled **only because this function implements its own opaque-session authentication**. Its unauthenticated actions are registration/login and non-sensitive health. Keep this schema off PostgREST exposed schemas.

Production should terminate HTTPS at a reverse proxy, forward WebSocket upgrades on `/sync`, set `COOKIE_SECURE=true`, and set `TRUST_PROXY=true` only behind your trusted proxy. The gateway checks Origin against the request host. Registration/login is rate limited; request bodies, images and document updates have explicit limits. Do not expose the development server for a public deployment. Local deployment defaults to one Node instance. Vercel uses the private Supabase realtime relay described in the deployment guide; multi-region and large-user-count scaling are not established.

## Limits and security assumptions

- Images: actual PNG/JPEG/WebP signatures, maximum 8 MB; editable bundles 18 MB request limit; documents 20 MB; 15,000 objects/100 pages per board.
- Tables UI: 100 rows × 30 columns; CSV file limit 2 MB. No external spreadsheet formulas are evaluated. CSV is plain data.
- PNG: maximum 32 million pixels / 16,000 pixels per dimension. SVG export uses standard fonts and embedded authorized image data.
- Text: 100,000 characters per object; comment 10,000; cursor chat 100 characters/8 seconds; reactions 5 seconds.
- Password hashing: 210,000 PBKDF2-SHA256 iterations with random 128-bit salt. No password-reset email integration is supplied. Sessions expire after 30 days.
- Self-service registration is open. Deploy behind your organization’s network/access boundary if registration must be restricted. Registering does not grant access to another user’s private data.
- Frontend fonts use Google Fonts with system fallbacks. Export uses a standard sans-serif font; pixel-identical font export is not promised.

## Tests and verification

```sh
npm run typecheck
npm run lint
npm test
# Start the application before integration/browser checks:
npx tsx tests/integration.ts
npx playwright install chromium
npm run test:e2e
npm run benchmark
```

Integration/E2E/benchmark tests create isolated **QA** accounts with random passwords and `@canvaslab.test` addresses in the configured database. They create real private test workspaces and do not send email or seed normal user accounts. Run against a development installation for routine CI. The development/sample content is created explicitly by templates or tests, never automatically on every startup.

## Backup and restore

Use the Supabase project’s backup facilities for the complete database, or a PostgreSQL dump with `--schema='Khalifah Board'`. Include all schema tables: document updates alone omit assets and access metadata. Treat account/session backups as sensitive. Restoring the database preserves board URLs and CRDT clocks. `.canvaslab` exports are editable per-board portable backups with images, but omit memberships, secrets, comments, workshop/private votes and version history.

## Known limitations

See the feature matrix for exact verification scope. Group dragging is implemented; unified group resize/rotation handles are not. Connectors use explicit side anchors and obstacle routing, including triangular boundaries. Rounded visual tips approximate the mathematical polygon boundary. Fully enclosed/overlapping endpoints can prevent a clear route; the fallback preserves attachments. Text input supports IME and Y.Text merging but does not transform a local text selection/caret against concurrent remote edits. Tables merge at the table-cells field, not per-cell CRDT. The gateway’s active metadata/access check is periodic (4 seconds), with immediate local revalidation after access mutations and before content broadcast. Changes made directly to the database outside the API are observed on that periodic check. Drawing has bounded point sampling and quadratic smoothing, not pressure-sensitive strokes.

The app has no native `.fig`/`.jam` parser, audio/video, SSO, billing, enterprise audit console, password recovery provider or multi-instance pub/sub. Browser screenshots and performance figures in `artifacts/` are actual runs, not scalability claims.

## References and licenses

Interaction references: [FigJam](https://www.figma.com/figjam/) and [Guide to FigJam](https://help.figma.com/hc/en-us/articles/1500004362321-Guide-to-FigJam). Technical references: [Yjs](https://docs.yjs.dev/), [Supabase Postgres from Edge Functions](https://supabase.com/docs/guides/functions/connect-to-postgres), [Postgres.js](https://github.com/porsager/postgres). React/Yjs/Vite use MIT licenses; Lucide icons ISC; Postgres.js Unlicense. No paid production engine key is required. Exact dependency versions and transitive licenses are recorded in `package-lock.json` and installed package manifests.
