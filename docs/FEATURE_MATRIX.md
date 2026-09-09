# CanvasLab requirement matrix

Source: [original Indonesian requirements](requirements.id.txt). Updated 9 September 2026. Implementation and verification are separate; no claim is made that the complete 36-scenario acceptance matrix passed.

Evidence: **U** = 56 passing unit tests; **I** = 11 real-Supabase integration scenarios; **W** = five direct WebSocket checks; **B** = nine browser scenarios plus one project-workflow scenario run separately; **R** = complete gateway restart and PNG durability; **P** = actual 1,100-item benchmark. See [test report](TEST_REPORT.md) and [FigJam UX research](FIGJAM_UX_RESEARCH.md).

| Requirement | Implementation | Executed evidence | Status / limitation |
|---|---|---|---|
| Working full-stack whiteboard, independent branding | React/TypeScript app, owned SVG/DOM canvas, Node WebSocket gateway, session API, Supabase PostgreSQL | I, W, B | Implemented; independent CanvasLab branding |
| Exact Supabase project and schema | Existing `Khalifah Internal Tools`; all 19 application tables in quoted `"Khalifah Board"` | I exercises real database | Implemented; no app tables in `public` |
| Workspace → Project → Board, no folders | Required foreign keys; dashboard/project pages open boards directly | I hierarchy/isolation; B dashboard/project screenshots | Verified at API level; registration, project and board navigation verified in B |
| Initial workspace/project after registration | Random-password self-registration creates personal workspace and initial project | I and W register isolated accounts | Verified; no email provider or fixed default password |
| Workspace create/rename/switch | Authenticated workspace actions and switcher | Source inspection | Implemented; full UI exercise pending |
| Workspace members and administration | Explicit scoped membership roles; workspace owner administration | I validates isolation; additional admin combinations not run | Implemented; workspace removal also revokes scoped grants |
| Project create/rename/description/icon/color | Project forms and server validation | I creates destination project; B creates named project via form | Create verified; exhaustive rename/style form combinations pending |
| Project visibility and memberships | Private projects require membership; explicit shared visibility; strongest role calculation | I verifies private project/search isolation | Implemented; all visibility transitions need dedicated browser checks |
| Project board list, search, sorting, counts | Access-filtered dashboard data, direct project view, list/grid | B screenshots; I private results | Implemented; exhaustive UI sort/count checks pending |
| Blank board creation with immediate default page | Server document initialization and client blank template | U default-page test; I board creation | Verified |
| Board rename, stable ID/URL | Metadata updates retain board primary key | I move/rename identity assertion | API verified; cross-browser rename UX pending |
| Board move menu and sidebar drag/drop | `project_id` changes transactionally; source/destination permissions; explicit access confirmation | I move and missing-confirmation rejection; B menu and sidebar drag/drop | Both UI routes verified with original URL and scene preserved |
| Move retains document/comments/assets/history | Same board ID and stored relationships | I verifies scene, comments, assets, ID | Verified for exercised data; snapshot retention follows unchanged board ID |
| Duplicate independent board | Fresh board/page/object/group/connector/asset IDs | I duplicate and snapshot; U object/page clone | Verified; comments, sessions, grants and prior versions deliberately omitted |
| Favorites and Recent per account | `preferences(user_id,board_id)` | I favorite isolation and Recent write | Verified API scope; Recent isolation assertion narrower than full UI requirement |
| Shared with me without parent leakage | Direct/link grants; parent names absent without project access | I scoped board grant and null project | Verified |
| Home, Recent, Favorites, Projects, Shared, Trash | Virtual dashboard views | Source and screenshots | Implemented; exhaustive view-navigation coverage remains partial |
| Board thumbnails from own document | Real per-board preview with honest empty/loading state | B preview loading assertion and screenshots | Verified for example boards; no shared dummy thumbnail |
| Breadcrumbs and board metadata | Clickable accessible ancestry; hidden inaccessible parent labels | I null private parent; B Back to project and reopening moved board | Exercised ancestry navigation verified |
| Metadata updates on other clients | Dashboard refresh and editor WebSocket metadata updates | W revocation/trash; earlier multiplayer screenshot | Implemented; rename/move propagation measurement pending |
| Soft delete, restore and project trash batches | `deleted_at` plus operation UUID; only same-batch boards restored | I dedicated trash/restore scenario | Verified |
| Trashed/open boards stop editing | Authorize writes and close active connections | W owner socket closed after trash; I access denied | Verified |
| Floating toolbar, topbar, pages/comments panels | Drag tools from toolbar/palette; live section sizing; integrated upper-left pages | B | Latest pointer gestures and final screenshots verified |
| Loading, empty, error, offline, revoked states | Save/status handling, error messages, permission screen | I error responses; W closures | Implemented; all visual failure states not yet exercised |
| Keyboard focus and Escape | Native dialogs, textarea focus and context-menu dismissal | B UI actions; U does not cover focus | Implemented; complete keyboard/focus audit not run |
| Responsive desktop/tablet layout | Responsive CSS; floating controls and panels | B 1440×900, 1280×800, 1024×768 screenshots; overflow assertion | Viewports exercised; physical touch device not tested |
| Infinite canvas/world coordinates | Local transformed camera; world-coordinate objects; adaptive contrast dot grid | U, B, P | Verified for exercised gestures and large board |
| Zoom-to-pointer, fit, 100%, wheel/pan | Accumulated camera target, animation-frame interpolation, direct drag pan, reduced-motion support | B, P | Pointer anchor and per-page camera restoration verified |
| Space/middle drag and touch pinch | Explicit panning state and touch-distance tracking | Source | Implemented; physical touch and complete browser gestures pending |
| Explicit interaction states | Idle/select/marquee/drag/resize/rotate/pan/draw/connect/edit handling | Source | Implemented; combined gesture regression checks pending |
| Select, multi-select, marquee, drag | Selection and expanded group/section membership | B selection, drag and reload | Implemented; B drag, selection and persistence passed; full marquee variants remain partial |
| Resize, rotate, snapping, align/distribute/tidy | Geometry tools, contextual menu and handles | Geometry U | Implemented; unified group transforms are limited and UX checks pending |
| Lock and z-order | Filtering locked objects for edits; order fields | Source | Implemented; shortcut/multi-selection lock regression pending |
| Keyboard shortcuts and text-input isolation | Global handler ignores typing/composition/dialog targets | Source, B tool shortcuts | Implemented; full IME and OS clipboard checks pending |
| Sticky multiline text, styles, author | Y.Text, DOM editing, folded corner, stronger colors; server-authoritative author | I, B | Toolbar drag/multiline/reload verified; combined color/resize workflow not exhaustively tested |
| Basic shape set and formatting | Rectangle, rounded rectangle, ellipse, diamond, triangle and flowchart-oriented shapes | B template; geometry U | Implemented; shape-by-shape visual regression pending |
| Text bold/italic/alignment/link | Styled render and safe links; DOM editing | Source | Implemented; local selection/caret does not transform against concurrent remote editing |
| Bound connectors, straight and elbow | Object IDs, endpoints, anchors, arrowheads/labels/styles | U moved/resized/rotated boundaries, named anchors, orthogonal route tests | Geometry and B side-handle drag, bound-object movement/reload verified |
| Connector obstacle routing | Deterministic detours, endpoint clearance, staggered barriers | Ten connector-routing U cases | Verified mathematically; not a complete industrial diagram router |
| Endpoint rebinding/detach/quick create | Editor connector interaction controls | Source; U free endpoints/deletion detach | B quick-create handle click selects nearest shape; exhaustive detach/rebind gestures remain partial |
| Connector clone/delete consistency | Reference remapping; detach removed targets | U and I | Verified |
| Sections and groups | Separate membership IDs; expanded dragging, grouping and ungrouping | U group-ID remap | Implemented; section membership gestures and group transform coverage pending |
| Pen/highlighter/eraser | Sampled stroke paths, smoothing, tools and undo transaction | B real freehand stroke | Freehand exercised; all eraser/highlighter combinations not run |
| Page create/rename/reorder/duplicate/delete | Internal page maps; last-page protection; current-page fallback | B create/duplicate/reorder; U duplicate/final-page safety | Implemented; two-user active-page deletion pending |
| Persistent images via picker/drop/clipboard | Private raster assets in PostgreSQL with MIME signature and size checks | I cross-account asset access; B upload/reload | Picker/persistence verified; drop and OS clipboard routes pending |
| Editable tables, CSV | Table DOM cells, row/column actions, CSV escaping and limits | U CSV round-trip/rejection | Implemented; browser table editing and row/column controls pending |
| Mind map child/sibling/layout | Real objects and bound connectors; keyboard/actions | U editable independent mind-map template | Implemented; creation shortcuts and auto-layout browser checks pending |
| Board text search and outline | Object/page/section list with camera navigation | Source; benchmark uses object search | Implemented; cross-page search navigation pending |
| Clipboard retains relationships | Fresh IDs and asset-aware copying within supported scope | U duplicate binding/group test | Implemented; native clipboard end-to-end pending |
| Custom registration/login/logout and sessions | Salted PBKDF2, hashed opaque token, 30-day session, HttpOnly cookie | I and W authenticated flows; U boundary checks | Verified core; no password-recovery provider |
| Strongest effective permission | Owner > editor > commenter > viewer across applicable grants | I viewer/commenter/editor and link cases | Verified exercised roles; complete combination matrix not run |
| No created-by permission bypass | Access derives from current memberships/grants, author data separate | I revoke blocks future access | Implemented and tested revocation |
| Registered-account sharing and revocable link | Explicit grants and separate link memberships | I link grant/default viewer/revoke/session preservation | Verified; no email invitation claim |
| Server API/asset/export/dashboard enforcement | Central board/project/workspace authorization | I private board/asset/search/export; U unauthorized boundary | Verified exercised operations |
| WebSocket role, origin and identity enforcement | Checked session, persisted write authorization, verified presence identity | W five cases | Verified; no arbitrary client author/role trust |
| Real multiplayer, late join, reconnect | Network WebSockets, Yjs state/update exchange, canonical server acknowledgement | I merge/load; W real sockets | Verified with two real browser contexts, offline reconciliation and revocation |
| Live cursors, presence, selection, follow | Ephemeral verified presence; user-triggered following | W identity; earlier multiplayer artifact | Implemented; full current browser follow test pending |
| Granular merge and local undo | Object `Y.Map`, text `Y.Text`, local tracked undo origins | U concurrency/local undo; I server concurrency | Verified model/API; tables currently merge entire `cells` field |
| IndexedDB offline/recovery and account isolation | Per-account/board cache; offline changes reconcile; revoked cache discarded | B offline reconciliation and persistent-profile close/reopen recovery | Verified pending edit absent on server before close and present after recovery |
| Durable save status, restart persistence | DB commit before acknowledgement; durable CRDT and private asset data | I load after save; B image reload; R distinct server process restart | Node restart preserves exact scene and PNG bytes; container runtime unverified |
| Comments/replies/resolve/reopen | SQL threads/messages and role/author enforcement | I all lifecycle operations; B real create/resolve/reopen | Verified; multi-browser live comment navigation not separately asserted |
| Shared timer | Server time, start/pause/resume/reset, facilitator authority | I timer transitions and denied non-facilitator | Verified API |
| Private voting, quota, results/history | Votes outside CRDT; locked quota checks; own votes only until end | I two-user privacy/quota/aggregate results | Verified API; counts apply to application accounts |
| Voting cursor privacy | Room privacy flag removes cursor/selection broadcast | I privateVoting response; source | Implemented; specific cursor-suppression WebSocket test not run |
| Stamps, reactions, cursor chat | Persistent stamp objects; ephemeral expiring messages/reactions | W presence timestamps | Implemented; all reaction UI controls pending |
| Snapshots restoring as independent boards | Stored CRDT snapshot copied to authorized project | I create/restore/different ID | Verified; same-board destructive rollback avoided |
| PNG/SVG beyond viewport, selection export | Geometry bounds, raster/vector export, embedded authorized images | B downloads; real export artifacts | Current-page downloads verified; offscreen/selection pixel comparison pending |
| Editable format and import | Versioned JSON bundle with objects/pages/assets; ID remap, destination authorization | I export/import/invalid version; B `.canvaslab` download | Verified; no native `.fig`/`.jam` parser |
| Seven editable templates | Brainstorm, retro, kanban, flowchart, mind map, journey, team | Seven independent-template U cases; B examples | Verified |
| Safe sample content | Explicit template/test creation, `Example`/QA labels | B sample workspace/project boards | Implemented; no hardcoded organization data or recurring seed |
| Request/upload limits and safe content | JSON-only actions; rate limits; raster sniffing; import limits; no server URL fetching | U malformed/oversized requests and hostile image data; I fake raster rejection | Verified exercised attacks; independent penetration test not performed |
| Accessible controls and outline | Labels, visible focus, tooltips, text outline | B accessible selectors | Implemented; assistive-technology and contrast audit pending |
| Performance techniques | Culling, update batching, presence throttle, memoization, sampled strokes | P actual Chromium measurements | Mean frame interval 18.35 ms, p95 33.30 ms in one local run; no scale guarantee |
| Reproducible 1000 objects + 100 connectors benchmark | Real Chromium script includes pan/zoom/drag/text/persistence measurements | P; `artifacts/benchmark.json` | Completed: initial load 2.216 s; drag through server confirmation 1.790 s |
| Source, manifest, lockfile, env, migrations | Repository files and pinned dependencies; private schema SQL | U, strict typecheck | Delivered; production build passed |
| Docker/local deployment and backup guidance | Dockerfile/Compose; external Supabase durability; README restore guidance | File inspection | Supplied; Docker execution and container execution not run; R verified Node restart and exact image bytes |
| Screenshots and real artifacts | Dashboard/project/blank/sample/share/comments/tablet images and downloadable exports | Existing `artifacts/` files | Generated; refreshed final editor and seeded dashboard screenshots supplied |

## Explicit remaining limits

- No claim of production readiness, FigJam compatibility, horizontal scale or a complete 36-scenario acceptance pass.
- Group dragging/grouping exists; unified group resize/rotation is not implemented.
- Table cells share a single field and do not provide independent concurrent cell merging. Local text caret/selection is not transformed against remote edits.
- Authentication does not supply email verification/recovery, SSO or a human-uniqueness guarantee for voting.
- The local gateway defaults to one Node instance. Vercel uses a private Supabase relay; sustained distributed load has not been measured. Out-of-band database access changes are detected by periodic permission checks.
- R verified a Node restart, B verified browser-close pending-edit recovery, and P measured the large board. Container runtime, physical touch/IME, exhaustive clipboard paths and accessibility audit remain unverified.
