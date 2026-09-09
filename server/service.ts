import * as Y from 'yjs';
import { jwtVerify, createRemoteJWKSet } from 'jose';

/** Read only in the Deno Edge Function this file actually runs in - a plain
 * `Deno` reference would fail Node's typecheck, which also lints this file. */
const GOOGLE_CLIENT_ID: string = (globalThis as any).Deno?.env?.get?.('GOOGLE_CLIENT_ID') ?? '';
const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** One authorization implementation used by Node and the Supabase Edge Function. */
type Row = Record<string, any>;
type Database = {
  unsafe: (query: string, parameters?: any[]) => Promise<any[]>;
  begin: <T>(fn: (sql: Database) => Promise<T>) => Promise<T>;
};
export type BoardRole = 'owner' | 'editor' | 'commenter' | 'viewer';
const ranks: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
const roles: BoardRole[] = ['viewer', 'commenter', 'editor', 'owner'];
const q = (db: Database, text: string, ...params: any[]) => db.unsafe(text, params);
const schema = '"Khalifah Board"';
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_failed') { super(message); }
}
function fail(status: number, message: string, code?: string): never { throw new ApiError(status, message, code); }
function str(value: unknown, label: string, max = 160, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function identifier(value: unknown, label = 'ID'): string {
  const result = str(value, label, 40);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) fail(400, `Invalid ${label}.`);
  return result;
}
function role(value: unknown, allowOwner = true): BoardRole {
  if (typeof value !== 'string' || !ranks[value] || (!allowOwner && value === 'owner')) fail(400, 'Invalid role.');
  return value as BoardRole;
}
function checkRank(value: number, required: BoardRole) { if (value < ranks[required]) fail(403, 'You do not have permission for this action.', 'permission_denied'); }
function safeUser(user: Row) { return { id: user.id, email: user.email, name: user.name, created_at: user.created_at, color: ['#7047eb','#cf763b','#16836e','#347ba9','#ad4976'][parseInt(user.id.slice(0,4),16)%5] }; }
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export function fromBase64(value: unknown, limit = 12 * 1024 * 1024): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(limit * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail(400, 'Invalid or oversized binary data.');
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    if (bytes.length > limit) fail(413, 'File is too large.');
    return bytes;
  } catch { return fail(400, 'Invalid binary data.'); }
}
async function digest(value: string) { return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
function secretToken() { return toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
async function passwordHash(password: string, salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(fromBase64(salt)), iterations: 210000 }, key, 256);
  return `pbkdf2-sha256$210000$${salt}$${toBase64(new Uint8Array(hash))}`;
}
function timingEqual(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
const sqlRank = (field: string) => `case ${field} when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end`;
const projectRank = `greatest(case when wm.role = 'owner' then 4 when not p.is_private then ${sqlRank('wm.role')} else 0 end, ${sqlRank('pm.role')})`;
const boardRank = `greatest(${projectRank}, ${sqlRank('bg.role')}, coalesce(lg.rank,0))`;
const projectSelect = `select p.*, ${projectRank} as rank, w.name as workspace_name from ${schema}.projects p
  join ${schema}.workspaces w on w.id=p.workspace_id
  left join ${schema}.workspace_memberships wm on wm.workspace_id=p.workspace_id and wm.user_id=$1
  left join ${schema}.project_memberships pm on pm.project_id=p.id and pm.user_id=$1`;
const boardSelect = `select b.*, ${boardRank} as rank, ${projectRank} as project_rank,
  p.workspace_id, p.deleted_at as project_deleted_at,
  case when ${projectRank}>0 then p.name else null end as project_name,
  case when ${projectRank}>0 then w.name else null end as workspace_name,
  a.name as creator_name, a.name as owner_name, bg.role as direct_role, coalesce(lg.rank,0) as link_rank
  from ${schema}.boards b join ${schema}.projects p on p.id=b.project_id
  join ${schema}.workspaces w on w.id=p.workspace_id
  join ${schema}.accounts a on a.id=b.created_by
  left join ${schema}.workspace_memberships wm on wm.workspace_id=p.workspace_id and wm.user_id=$1
  left join ${schema}.project_memberships pm on pm.project_id=p.id and pm.user_id=$1
  left join ${schema}.board_grants bg on bg.board_id=b.id and bg.user_id=$1
  left join lateral (select max(${sqlRank('sl.role')}) as rank from ${schema}.share_links sl
    join ${schema}.link_memberships lm on lm.link_id=sl.id and lm.user_id=$1
    where sl.board_id=b.id and sl.revoked_at is null) lg on true`;
const withRole = (row: Row): Row & {role:BoardRole} => ({ ...row, role: roles[Number(row.rank) - 1] });
async function workspaceAccess(db: Database, user: Row, id: string, required: BoardRole = 'viewer') {
  const rows = await q(db, `select w.*, ${sqlRank('wm.role')} as rank from ${schema}.workspaces w
    join ${schema}.workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=$1 where w.id=$2`, user.id, id);
  if (!rows.length) fail(404, 'Workspace not found.');
  checkRank(Number(rows[0].rank), required);
  return withRole(rows[0]);
}
async function projectAccess(db: Database, user: Row, id: string, required: BoardRole = 'viewer', trash = false) {
  const rows = await q(db, `${projectSelect} where p.id=$2 and ${projectRank}>0`, user.id, id);
  if (!rows.length || (!trash && rows[0].deleted_at)) fail(404, 'Project not found.');
  checkRank(Number(rows[0].rank), required);
  return withRole(rows[0]);
}
async function boardAccess(db: Database, user: Row, id: string, required: BoardRole = 'viewer', trash = false) {
  const rows = await q(db, `${boardSelect} where b.id=$2 and ${boardRank}>0`, user.id, id);
  if (!rows.length || (!trash && (rows[0].deleted_at || rows[0].project_deleted_at))) fail(404, 'Board not found or access was revoked.', 'board_unavailable');
  checkRank(Number(rows[0].rank), required);
  return withRole(rows[0]);
}
async function findAccount(db: Database, email: unknown) {
  const normalized = str(email, 'Email', 254).toLowerCase();
  const rows = await q(db, `select id,email,name from ${schema}.accounts where email=$1`, normalized);
  if (!rows.length) fail(404, 'No registered account uses this email. Ask them to register first.');
  return rows[0];
}
async function createPersonalWorkspace(db: Database, userId: string, name: string) {
  const [workspace] = await q(db, `insert into ${schema}.workspaces(name,created_by) values($1,$2) returning *`, `${name}'s workspace`.slice(0,120), userId);
  await q(db, `insert into ${schema}.workspace_memberships(workspace_id,user_id,role) values($1,$2,'owner')`, workspace.id, userId);
  const [project] = await q(db, `insert into ${schema}.projects(workspace_id,name,description,created_by) values($1,'My first project','A space for your ideas.',$2) returning *`, workspace.id, userId);
  await q(db, `insert into ${schema}.project_memberships(project_id,user_id,role) values($1,$2,'owner')`, project.id, userId);
  return { workspace, project };
}
async function issueSession(db: Database, userId: string) {
  const token = secretToken();
  await q(db, `insert into ${schema}.sessions(token_hash,user_id) values($1,$2)`, await digest(token), userId);
  return token;
}
async function loadDocument(db: Database, boardId: string) {
  const rows = await q(db, `select update_data from ${schema}.document_updates where board_id=$1 order by sequence`, boardId);
  const doc = new Y.Doc(); doc.getMap('objects'); doc.getMap('pages');
  for (const row of rows) Y.applyUpdate(doc, new Uint8Array(row.update_data));
  return doc;
}
/** Validate CRDT structure, then make author names server-authoritative. */
async function normalizeDocument(db: Database, doc: Y.Doc, boardId: string, user: Row) {
  const objects = doc.getMap<Y.Map<any>>('objects');
  const pages = doc.getMap<Y.Map<any>>('pages');
  if (objects.size > 15000 || pages.size > 100) fail(413, 'A board supports at most 15,000 objects and 100 pages.');
  const authors = await q(db, `select object_id,author_name from ${schema}.object_authors where board_id=$1`, boardId);
  const byId = new Map(authors.map((a) => [a.object_id, a.author_name]));
  const newAuthors: string[] = [];
  objects.forEach((object, id) => {
    if (!(object instanceof Y.Map) || id.length > 120) fail(400, 'Invalid canvas object.');
    for (const key of ['x','y','width','height','rotation']) {
      const value = object.get(key);
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e8)) fail(400, 'Invalid object geometry.');
    }
    const text = object.get('text');
    if (text !== undefined && (!(text instanceof Y.Text) || text.length > 100000)) fail(400, 'Invalid collaborative text.');
    const points = object.get('points');
    if (points !== undefined && (!Array.isArray(points) || points.length > 30000 || points.some((n) => !n || typeof n.x !== 'number' || typeof n.y !== 'number' || !Number.isFinite(n.x) || !Number.isFinite(n.y)))) fail(400, 'Invalid drawing.');
    const cells = object.get('cells');
    if (cells !== undefined && (!Array.isArray(cells) || cells.length > 1000 || cells.some((r) => !Array.isArray(r) || r.length > 100 || r.some((c) => typeof c !== 'string' || c.length > 10000)))) fail(400, 'Table exceeds supported limits.');
    if (!byId.has(id)) { byId.set(id, user.name); newAuthors.push(id); }
    if (object.get('author') !== byId.get(id)) object.set('author', byId.get(id));
    if (object.get('id') !== id) object.set('id', id);
    // Reject parent cycles, including indirect cycles, without coupling page deletion to object lifetime.
    const seen = new Set([id]); let parent = object.get('groupId');
    while (typeof parent === 'string' && objects.has(parent)) {
      if (seen.has(parent)) fail(400, 'Circular group membership is not allowed.');
      seen.add(parent); parent = objects.get(parent)?.get('groupId');
    }
  });
  pages.forEach((page, id) => { if (!(page instanceof Y.Map) || id.length > 120 || String(page.get('name') ?? '').length > 120) fail(400, 'Invalid page.'); });
  if (!pages.size) { const id = newId(); const page = new Y.Map(); page.set('id', id); page.set('name', 'Page 1'); page.set('order', 0); pages.set(id, page); }
  if (newAuthors.length) await q(db, `insert into ${schema}.object_authors(board_id,object_id,user_id,author_name)
    select $1,item.object_id,$2,$3 from jsonb_to_recordset($4::text::jsonb) as item(object_id text) on conflict do nothing`,boardId,user.id,user.name,JSON.stringify(newAuthors.map((object_id)=>({object_id}))));
  const encoded = Y.encodeStateAsUpdate(doc);
  if (encoded.byteLength > 20000000) fail(413, 'Board document exceeds 20 MB. Split content across boards.');
  return encoded;
}
async function writeInitial(db: Database, boardId: string, user: Row, update?: unknown) {
  const doc = new Y.Doc(); doc.getMap('objects'); doc.getMap('pages');
  if (update) { try { Y.applyUpdate(doc, fromBase64(update)); } catch { fail(400, 'This editable board file is invalid.'); } }
  try {
    const bytes = await normalizeDocument(db, doc, boardId, user);
    await q(db, `insert into ${schema}.document_updates(board_id,update_id,update_data,created_by) values($1,$2,$3,$4)`, boardId, newId(), bytes, user.id);
  } finally { doc.destroy(); }
}
async function createBoard(db: Database, user: Row, projectId: string, name: string) {
  await projectAccess(db, user, projectId, 'editor');
  const [board] = await q(db, `insert into ${schema}.boards(project_id,name,created_by) values($1,$2,$3) returning *`, projectId, name, user.id);
  await q(db, `insert into ${schema}.board_grants(board_id,user_id,role) values($1,$2,'owner')`, board.id, user.id);
  return board;
}
/** Deep clone shared types and remap every reference, including images. */
function cloneValue(value: any, ids: Map<string, string>): any {
  if (value instanceof Y.Text) { const result = new Y.Text(); result.applyDelta(value.toDelta()); return result; }
  if (value instanceof Y.Map) { const result = new Y.Map(); value.forEach((v, k) => result.set(k, cloneValue(v, ids))); return result; }
  if (value instanceof Y.Array) { const result = new Y.Array(); result.push(value.toArray().map((v) => cloneValue(v, ids))); return result; }
  if (Array.isArray(value)) return value.map((v) => cloneValue(v, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v, ids)]));
  return typeof value === 'string' ? (ids.get(value) ?? value) : value;
}
async function duplicateDocument(db: Database, user: Row, source: Row, target: Row, fromSnapshot?: Uint8Array) {
  const doc = fromSnapshot ? new Y.Doc() : await loadDocument(db, source.id);
  if (fromSnapshot) { doc.getMap('objects'); doc.getMap('pages'); Y.applyUpdate(doc, fromSnapshot); }
  const copy = new Y.Doc();
  try {
    const ids = new Map<string, string>();
    for (const key of ['objects','pages']) doc.getMap(key).forEach((_v, id) => ids.set(id, newId()));
    // Group IDs are identifiers even when the group does not have a rendered object.
    doc.getMap<Y.Map<any>>('objects').forEach((object) => { for (const key of ['groupId','sectionId']) { const id = object.get(key); if (typeof id === 'string' && id && !ids.has(id)) ids.set(id, newId()); } });
    const assets = await q(db, `select * from ${schema}.assets where board_id=$1`, source.id);
    for (const asset of assets) {
      const assetId = newId(); ids.set(asset.id, assetId);
      await q(db, `insert into ${schema}.assets(id,board_id,name,mime,data,created_by) values($1,$2,$3,$4,$5,$6)`, assetId,target.id,asset.name,asset.mime,asset.data,user.id);
    }
    for (const key of ['objects','pages']) doc.getMap(key).forEach((value, id) => copy.getMap(key).set(ids.get(id)!, cloneValue(value, ids)));
    const bytes = await normalizeDocument(db, copy, target.id, user);
    await q(db, `insert into ${schema}.document_updates(board_id,update_id,update_data,created_by) values($1,$2,$3,$4)`, target.id, newId(), bytes, user.id);
  } finally { doc.destroy(); copy.destroy(); }
}
export function detectImage(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (String.fromCharCode(...bytes.subarray(0,4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
async function rateLimit(db: Database, label: string) {
  const key = await digest(label);
  const [row] = await q(db, `insert into ${schema}.rate_limits(key) values($1)
    on conflict(key) do update set attempts=case when ${schema}.rate_limits.window_at < now()-interval '15 minutes' then 1 else ${schema}.rate_limits.attempts+1 end,
    window_at=case when ${schema}.rate_limits.window_at < now()-interval '15 minutes' then now() else ${schema}.rate_limits.window_at end returning attempts`, key);
  if (row.attempts > 20) fail(429, 'Too many authentication attempts. Try again in 15 minutes.');
}

export function createService(sql: Database): (request: Request) => Promise<Response> {
  return async (request) => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      if (request.method !== 'POST') fail(405, 'Use POST with a JSON action.');
      if (!request.headers.get('content-type')?.includes('application/json')) fail(415, 'JSON requests are required.');
      if (Number(request.headers.get('content-length') ?? 0) > 18000000) fail(413, 'Request is too large.');
      const raw = await request.text();
      if (raw.length > 18000000) fail(413, 'Request is too large.');
      let body: Row;
      try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'Invalid request.');
      const action = str(body.action, 'Action', 80);
      if (action === 'health') return new Response(JSON.stringify({ ok: true, storage: 'Supabase PostgreSQL', schema: 'Khalifah Board' }), { headers });
      if (action === 'auth.register' || action === 'auth.login') {
        const email = str(body.email, 'Email', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length > 1024) fail(400, 'Password must not exceed 1024 characters.');
        if (password.length < 8) fail(400, 'Use a password with at least 8 characters.');
        await rateLimit(sql, `auth:${email}`);
        const result = await sql.begin(async (db) => {
          if (action === 'auth.register') {
            const name = str(body.name, 'Name', 80);
            const hash = await passwordHash(password);
            const [user] = await q(db, `insert into ${schema}.accounts(email,name,password_hash) values($1,$2,$3) returning id,email,name,created_at`, email,name,hash);
            const { workspace, project } = await createPersonalWorkspace(db, user.id, name);
            return { user: safeUser(user), token: await issueSession(db, user.id), workspace, project };
          }
          const [user] = await q(db, `select * from ${schema}.accounts where email=$1`, email);
          const hash = await passwordHash(password, user?.password_hash?.split('$')[2] ?? 'AAAAAAAAAAAAAAAAAAAAAA==');
          if (!user || !user.password_hash || !timingEqual(hash, user.password_hash)) fail(401, 'Incorrect email or password.');
          return { user: safeUser(user), token: await issueSession(db, user.id) };
        });
        return new Response(JSON.stringify(result), { headers });
      }
      if (action === 'auth.google') {
        if (!GOOGLE_CLIENT_ID) fail(503, 'Google sign-in is not configured on this server.');
        const credential = str(body.credential, 'Google credential', 4096);
        await rateLimit(sql, 'auth:google');
        let claims: Record<string, unknown>;
        try {
          const { payload } = await jwtVerify(credential, googleJWKS, {
            issuer: ['https://accounts.google.com', 'accounts.google.com'],
            audience: GOOGLE_CLIENT_ID,
          });
          claims = payload;
        } catch { return fail(401, 'Google sign-in could not be verified. Please try again.'); }
        if (!claims.email || claims.email_verified === false) fail(401, 'That Google account has no verified email address.');
        const email = String(claims.email).toLowerCase();
        const sub = str(claims.sub, 'Google subject', 255);
        const name = str(claims.name, 'Name', 80, email.split('@')[0]);
        const result = await sql.begin(async (db) => {
          let [user] = await q(db, `select * from ${schema}.accounts where google_sub=$1`, sub);
          if (!user) {
            [user] = await q(db, `select * from ${schema}.accounts where email=$1`, email);
            if (user) {
              // An account already exists for this email (created with a
              // password) - link this Google identity to it going forward.
              await q(db, `update ${schema}.accounts set google_sub=$2 where id=$1`, user.id, sub);
            } else {
              const [created] = await q(db, `insert into ${schema}.accounts(email,name,google_sub) values($1,$2,$3) returning id,email,name,created_at`, email, name, sub);
              user = created;
              await createPersonalWorkspace(db, user.id, name);
            }
          }
          return { user: safeUser(user), token: await issueSession(db, user.id) };
        });
        return new Response(JSON.stringify(result), { headers });
      }
      const token = request.headers.get('x-board-session');
      if (!token || token.length > 128) fail(401, 'Sign in to continue.', 'unauthenticated');
      const tokenHash = await digest(token);
      const [user] = await q(sql, `select a.id,a.email,a.name,a.created_at from ${schema}.sessions s join ${schema}.accounts a on a.id=s.user_id where s.token_hash=$1 and s.expires_at>now()`, tokenHash);
      if (!user) fail(401, 'Your session has expired. Sign in again.', 'unauthenticated');
      const result = await sql.begin((db) => dispatch(db, user, body, tokenHash));
      return new Response(JSON.stringify(result), { headers });
    } catch (error: any) {
      if (error instanceof ApiError) return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: error.status, headers });
      if (error?.code === '23505') return new Response(JSON.stringify({ error: 'This account or item already exists.', code: 'already_exists' }), { status: 409, headers });
      if (error?.code === '23503' || error?.code === '22P02' || error?.code === '23514') return new Response(JSON.stringify({ error: 'Invalid data or unavailable destination.', code: 'invalid_data' }), { status: 400, headers });
      console.error('CanvasLab API failure:', error?.code ?? error?.name, error?.message);
      return new Response(JSON.stringify({ error: 'The server could not complete this request. Please retry.', code: error?.code||error?.name||'server_error' }), { status: 500, headers });
    }
  };
}

async function dispatch(db: Database, user: Row, b: Row, tokenHash: string): Promise<any> {
  const action = b.action;
  if (action === 'auth.me') return { user: safeUser(user) };
  if (action === 'auth.logout') { await q(db, `delete from ${schema}.sessions where token_hash=$1`, tokenHash); return { ok: true }; }
  if (action === 'dashboard') {
    const workspaces = await q(db, `select distinct w.*, ${sqlRank('wm.role')} as rank from ${schema}.workspaces w
      left join ${schema}.workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=$1
      where wm.user_id is not null or exists(select 1 from ${schema}.projects p join ${schema}.project_memberships pm on pm.project_id=p.id and pm.user_id=$1 where p.workspace_id=w.id)`, user.id);
    const projects = await q(db, `${projectSelect} where ${projectRank}>0 order by p.created_at`, user.id);
    const boards = await q(db, `${boardSelect} where ${boardRank}>0 order by b.updated_at desc`, user.id);
    const visible = new Set(boards.map((board) => board.id));
    const preferences = await q(db, `select board_id,favorite,recent_at from ${schema}.preferences where user_id=$1 order by recent_at desc nulls last`, user.id);
    return { workspaces: workspaces.map(withRole), projects: projects.map(withRole), boards: boards.map(withRole), shared:boards.filter(b=>b.direct_role||b.link_rank>0).map(b=>b.id),
      favorites: preferences.filter((p) => p.favorite && visible.has(p.board_id)).map((p) => p.board_id),
      recents: preferences.filter((p) => p.recent_at && visible.has(p.board_id)).map((p) => p.board_id) };
  }
  if (action === 'workspace.create') {
    const [workspace] = await q(db, `insert into ${schema}.workspaces(name,created_by) values($1,$2) returning *`, str(b.name, 'Workspace name', 120),user.id);
    await q(db, `insert into ${schema}.workspace_memberships(workspace_id,user_id,role) values($1,$2,'owner')`, workspace.id,user.id);
    return { workspace: { ...workspace, role: 'owner' } };
  }
  if (action.startsWith('workspace.')) {
    const id = identifier(b.workspace_id, 'Workspace ID');
    await workspaceAccess(db,user,id, action === 'workspace.members' ? 'viewer' : 'owner');
    if (action === 'workspace.update') { const [workspace] = await q(db, `update ${schema}.workspaces set name=$2,updated_at=now() where id=$1 returning *`, id,str(b.name,'Workspace name',120)); return { workspace }; }
    if (action === 'workspace.members') return { members: await q(db, `select a.id,a.email,a.name,wm.role from ${schema}.workspace_memberships wm join ${schema}.accounts a on a.id=wm.user_id where wm.workspace_id=$1 order by a.name`,id) };
    if (action === 'workspace.member_set') {
      const member = await findAccount(db,b.email); const nextRole = b.role === null || b.role === 'remove' ? null : role(b.role);
      await q(db, `select id from ${schema}.workspaces where id=$1 for update`,id);
      if (nextRole !== 'owner') {
        const owners = await q(db, `select user_id from ${schema}.workspace_memberships where workspace_id=$1 and role='owner'`,id);
        if (owners.length === 1 && owners[0].user_id === member.id) fail(400,'A workspace must retain an owner.');
      }
      if (nextRole) await q(db, `insert into ${schema}.workspace_memberships(workspace_id,user_id,role) values($1,$2,$3) on conflict(workspace_id,user_id) do update set role=excluded.role`,id,member.id,nextRole);
      else {
        await q(db, `delete from ${schema}.workspace_memberships where workspace_id=$1 and user_id=$2`,id,member.id);
        // Workspace removal also revokes grants inside it, including previously accepted links.
        await q(db, `delete from ${schema}.project_memberships where user_id=$2 and project_id in(select id from ${schema}.projects where workspace_id=$1)`,id,member.id);
        await q(db, `delete from ${schema}.board_grants where user_id=$2 and board_id in(select b.id from ${schema}.boards b join ${schema}.projects p on p.id=b.project_id where p.workspace_id=$1)`,id,member.id);
        await q(db, `delete from ${schema}.link_memberships where user_id=$2 and link_id in(select sl.id from ${schema}.share_links sl join ${schema}.boards b on b.id=sl.board_id join ${schema}.projects p on p.id=b.project_id where p.workspace_id=$1)`,id,member.id);
      }
      return { ok: true };
    }
  }
  if (action === 'project.create') {
    const workspaceId = identifier(b.workspace_id,'Workspace ID'); await workspaceAccess(db,user,workspaceId,'editor');
    const [project] = await q(db, `insert into ${schema}.projects(workspace_id,name,description,icon,color,created_by,is_private) values($1,$2,$3,$4,$5,$6,$7) returning *`,workspaceId,str(b.name,'Project name',120),String(b.description ?? '').slice(0,2000),str(b.icon,'Icon',32,'✦'),str(b.color,'Color',7,'#635bff'),user.id,b.is_private!==false);
    await q(db, `insert into ${schema}.project_memberships(project_id,user_id,role) values($1,$2,'owner')`,project.id,user.id);
    return { project: { ...project, role: 'owner' } };
  }
  if (action.startsWith('project.')) {
    const id = identifier(b.project_id,'Project ID');
    const project = await projectAccess(db,user,id,action === 'project.members' ? 'viewer' : action === 'project.update' ? 'editor' : 'owner',action === 'project.restore');
    if (action === 'project.update') {
      if(b.is_private!==undefined&&b.is_private!==project.is_private)checkRank(Number(project.rank),'owner');
      const [updated] = await q(db, `update ${schema}.projects set name=$2,description=$3,icon=$4,color=$5,is_private=$6,updated_at=now() where id=$1 returning *`,id,str(b.name,'Project name',120,project.name),String(b.description ?? project.description).slice(0,2000),str(b.icon,'Icon',32,project.icon),str(b.color,'Color',7,project.color),b.is_private??project.is_private);
      return { project: updated };
    }
    if (action === 'project.trash') {
      await q(db, `select id from ${schema}.projects where id=$1 for update`,id); const batch = newId();
      await q(db, `update ${schema}.projects set deleted_at=now(),trash_batch=$2,updated_at=now() where id=$1`,id,batch);
      const boards = await q(db, `update ${schema}.boards set deleted_at=now(),trash_batch=$2,updated_at=now() where project_id=$1 and deleted_at is null returning id`,id,batch);
      return { ok: true, affected: boards.length };
    }
    if (action === 'project.restore') {
      await q(db, `select id from ${schema}.projects where id=$1 for update`,id);
      await q(db, `update ${schema}.boards set deleted_at=null,trash_batch=null,updated_at=now() where project_id=$1 and trash_batch=$2`,id,project.trash_batch);
      await q(db, `update ${schema}.projects set deleted_at=null,trash_batch=null,updated_at=now() where id=$1`,id); return { ok: true };
    }
    if (action === 'project.members') return { members: await q(db, `select a.id,a.email,a.name,pm.role from ${schema}.project_memberships pm join ${schema}.accounts a on a.id=pm.user_id where pm.project_id=$1 order by a.name`,id) };
    if (action === 'project.member_set') {
      const member = await findAccount(db,b.email); const nextRole = b.role === null || b.role === 'remove' ? null : role(b.role);
      if (nextRole) await q(db, `insert into ${schema}.project_memberships(project_id,user_id,role) values($1,$2,$3) on conflict(project_id,user_id) do update set role=excluded.role`,id,member.id,nextRole);
      else await q(db, `delete from ${schema}.project_memberships where project_id=$1 and user_id=$2`,id,member.id);
      return { ok: true };
    }
  }
  if (action === 'board.create') {
    const board = await createBoard(db,user,identifier(b.project_id,'Project ID'),str(b.name,'Board name',160,'Untitled board'));
    await writeInitial(db,board.id,user,b.initial_update); return { board: await boardAccess(db,user,board.id) };
  }
  if (action === 'board.import') return importBundle(db,user,b);
  if (action === 'board.link_accept') {
    const token = str(b.token,'Share token',128);
    const [link] = await q(db, `select sl.* from ${schema}.share_links sl join ${schema}.boards b on b.id=sl.board_id join ${schema}.projects p on p.id=b.project_id where token_hash=$1 and revoked_at is null and b.deleted_at is null and p.deleted_at is null`,await digest(token));
    if (!link) fail(404,'This share link is unavailable or has been revoked.');
    await q(db, `insert into ${schema}.link_memberships(link_id,user_id) values($1,$2) on conflict do nothing`,link.id,user.id);
    return { board: await boardAccess(db,user,link.board_id), board_id: link.board_id };
  }
  // All remaining actions are scoped to a board. Never infer access from created_by.
  const boardId = identifier(b.board_id,'Board ID');
  const required: BoardRole = ['board.share_set','board.link_create','board.link_revoke','board.share_list'].includes(action) ? 'owner'
    : ['board.update','board.trash','board.restore','scene.push','asset.create','snapshot.create','workshop.timer','workshop.vote_start','workshop.vote_end'].includes(action) ? 'editor'
    : ['comment.create','comment.reply','comment.resolve','workshop.vote_cast'].includes(action) ? 'commenter' : 'viewer';
  const board = await boardAccess(db,user,boardId,required,action === 'board.restore');
  if (action === 'board.get') return { board, role: board.role,
    project: board.project_rank > 0 ? { id:board.project_id,name:board.project_name,workspace_id:board.workspace_id,role:roles[board.project_rank-1] } : null,
    workspace: board.project_rank > 0 ? { id:board.workspace_id,name:board.workspace_name } : null };
  if (action === 'board.update') {
    let target = board.project_id;
    if (b.project_id && b.project_id !== board.project_id) {
      await projectAccess(db,user,board.project_id,'editor');
      const destination = await projectAccess(db,user,identifier(b.project_id,'Project ID'),'editor');
      if (destination.workspace_id !== board.workspace_id) fail(400,'Move is supported within one workspace.');
      if (!b.access_confirmed) fail(409,'Moving changes inherited access to the destination project. Direct board grants and active share links remain. Confirm this access change.','confirm_access_change');
      target = destination.id;
    }
    let thumbnail = board.thumbnail;
    if (b.thumbnail !== undefined) {
      if (b.thumbnail !== null && (typeof b.thumbnail !== 'string' || b.thumbnail.length > 500000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.thumbnail))) fail(400,'Invalid thumbnail.');
      thumbnail = b.thumbnail;
    }
    await q(db, `update ${schema}.boards set name=$2,project_id=$3,thumbnail=$4,updated_at=now() where id=$1`,boardId,str(b.name,'Board name',160,board.name),target,thumbnail);
    return { board: await boardAccess(db,user,boardId) };
  }
  if (action === 'board.duplicate') {
    const targetProject = b.project_id ? identifier(b.project_id,'Project ID') : board.project_id;
    const copy = await createBoard(db,user,targetProject,str(b.name,'Board name',160,`${board.name} (copy)`.slice(0,160)));
    await duplicateDocument(db,user,board,copy); return { board: await boardAccess(db,user,copy.id) };
  }
  if (action === 'board.trash') { await q(db, `update ${schema}.boards set deleted_at=now(),trash_batch=$2,updated_at=now() where id=$1`,boardId,newId()); return { ok:true }; }
  if (action === 'board.restore') {
    const target = b.project_id ? identifier(b.project_id,'Project ID') : board.project_id;
    const destination = await projectAccess(db,user,target,'editor');
    if (destination.workspace_id !== board.workspace_id) fail(400,'Restore must stay in the same workspace.');
    await q(db, `update ${schema}.boards set project_id=$2,deleted_at=null,trash_batch=null,updated_at=now() where id=$1`,boardId,target); return { board:await boardAccess(db,user,boardId) };
  }
  if (action === 'board.favorite' || action === 'board.recent') {
    if (action === 'board.favorite') await q(db, `insert into ${schema}.preferences(user_id,board_id,favorite) values($1,$2,$3) on conflict(user_id,board_id) do update set favorite=excluded.favorite`,user.id,boardId,!!b.value);
    else await q(db, `insert into ${schema}.preferences(user_id,board_id,recent_at) values($1,$2,now()) on conflict(user_id,board_id) do update set recent_at=now()`,user.id,boardId);
    return { ok:true };
  }
  if (action === 'board.share_list') {
    const grants = await q(db, `select a.id,a.id as user_id,a.name,a.email,bg.role from ${schema}.board_grants bg join ${schema}.accounts a on a.id=bg.user_id where bg.board_id=$1 order by a.name`,boardId);
    const links = await q(db, `select id,role,created_at,revoked_at from ${schema}.share_links where board_id=$1 order by created_at desc`,boardId);
    const projectMembers = board.project_rank>0 ? await q(db, `select a.id,a.name,a.email,pm.role from ${schema}.project_memberships pm join ${schema}.accounts a on a.id=pm.user_id where pm.project_id=$1`,board.project_id) : [];
    return { grants, members:grants, links, project_members:projectMembers };
  }
  if (action === 'board.share_set') {
    const member = await findAccount(db,b.email); const nextRole = b.role === null || b.role === 'remove' ? null : role(b.role);
    if (nextRole) await q(db, `insert into ${schema}.board_grants(board_id,user_id,role) values($1,$2,$3) on conflict(board_id,user_id) do update set role=excluded.role`,boardId,member.id,nextRole);
    else {
      await q(db, `delete from ${schema}.board_grants where board_id=$1 and user_id=$2`,boardId,member.id);
      await q(db, `delete from ${schema}.link_memberships where user_id=$2 and link_id in(select id from ${schema}.share_links where board_id=$1)`,boardId,member.id);
    }
    return { ok:true };
  }
  if (action === 'board.link_create') {
    const token = secretToken();
    const [link] = await q(db, `insert into ${schema}.share_links(board_id,token_hash,role,created_by) values($1,$2,$3,$4) returning id,role,created_at`,boardId,await digest(token),role(b.role ?? 'viewer',false),user.id);
    return { link:{ ...link,token },token };
  }
  if (action === 'board.link_revoke') { await q(db, `update ${schema}.share_links set revoked_at=now() where id=$1 and board_id=$2`,identifier(b.link_id,'Link ID'),boardId); return { ok:true }; }
  if (action === 'scene.load') {
    const doc = await loadDocument(db,boardId);
    try { return { updates:[toBase64(Y.encodeStateAsUpdate(doc))],role:board.role }; } finally { doc.destroy(); }
  }
  if (action === 'scene.push') {
    // Serialize merge/compaction per board. Permission is read again after this lock.
    await q(db, `select id from ${schema}.boards where id=$1 for update`,boardId);
    await boardAccess(db,user,boardId,'editor');
    const updateId = identifier(b.update_id,'Update ID');
    const previous = await q(db, `select sequence,update_data from ${schema}.document_updates where board_id=$1 and update_id=$2`,boardId,updateId);
    if (previous.length) return { sequence:String(previous[0].sequence),update:toBase64(new Uint8Array(previous[0].update_data)) };
    const doc = await loadDocument(db,boardId);
    try {
      const vector = Y.encodeStateVector(doc);
      try { Y.applyUpdate(doc,fromBase64(b.update)); } catch { fail(400,'Invalid collaborative document update.'); }
      await normalizeDocument(db,doc,boardId,user);
      const canonical = Y.encodeStateAsUpdate(doc,vector);
      const [row] = await q(db, `insert into ${schema}.document_updates(board_id,update_id,update_data,created_by) values($1,$2,$3,$4) returning sequence`,boardId,updateId,canonical,user.id);
      await q(db, `update ${schema}.boards set updated_at=now() where id=$1`,boardId);
      // CRDT state includes all prior clocks and deletion sets, so older retries remain idempotent after compaction.
      const [count] = await q(db, `select count(*)::integer as count from ${schema}.document_updates where board_id=$1`,boardId);
      if (count.count > 250) {
        await q(db, `delete from ${schema}.document_updates where board_id=$1 and sequence<$2`,boardId,row.sequence);
        await q(db, `update ${schema}.document_updates set update_data=$2 where sequence=$1`,row.sequence,Y.encodeStateAsUpdate(doc));
      }
      return { sequence:String(row.sequence),update:toBase64(canonical) };
    } finally { doc.destroy(); }
  }
  if (action === 'asset.create') {
    const bytes = fromBase64(b.data,8388608); const mime = detectImage(bytes);
    if (!mime || mime !== b.mime) fail(400,'Only real PNG, JPEG, and WebP images up to 8 MB are supported.');
    const [asset] = await q(db, `insert into ${schema}.assets(board_id,name,mime,data,created_by) values($1,$2,$3,$4,$5) returning id,name,mime,created_at`,boardId,str(b.name,'Image name',255,'image'),mime,bytes,user.id);
    return { asset,asset_id:asset.id };
  }
  if (action === 'asset.get') {
    const [asset] = await q(db, `select id,name,mime,data from ${schema}.assets where id=$1 and board_id=$2`,identifier(b.asset_id,'Asset ID'),boardId);
    if (!asset) fail(404,'Image is missing or unavailable.');
    return { asset:{ ...asset,data:toBase64(new Uint8Array(asset.data)) },data:toBase64(new Uint8Array(asset.data)),mime:asset.mime,name:asset.name };
  }
  if (action === 'board.export') {
    const doc=await loadDocument(db,boardId);
    try {
      const assets=await q(db, `select id,name,mime,data from ${schema}.assets where board_id=$1`,boardId);
      return { schemaVersion:1,board:{name:board.name},pages:[...doc.getMap<Y.Map<any>>('pages').values()].map((p)=>p.toJSON()),objects:[...doc.getMap<Y.Map<any>>('objects').values()].map((o)=>o.toJSON()),assets:assets.map((a)=>({...a,data:toBase64(new Uint8Array(a.data))})) };
    } finally { doc.destroy(); }
  }
  if (action === 'comment.list') return { comments:await q(db, `select c.*,a.name as author_name from ${schema}.comments c join ${schema}.accounts a on a.id=c.author_id where c.board_id=$1 order by c.created_at`,boardId) };
  if (action === 'comment.create' || action === 'comment.reply') {
    let parentId:string|null = null;
    if (action === 'comment.reply') {
      parentId=identifier(b.thread_id,'Thread ID');
      const [parent] = await q(db, `select id from ${schema}.comments where id=$1 and board_id=$2 and parent_id is null`,parentId,boardId);
      if (!parent) fail(404,'Comment thread not found.');
    }
    const x = typeof b.x === 'number' && Number.isFinite(b.x) ? b.x : null;
    const y = typeof b.y === 'number' && Number.isFinite(b.y) ? b.y : null;
    const [comment] = await q(db, `insert into ${schema}.comments(board_id,parent_id,object_id,x,y,text,author_id,page_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,boardId,parentId,typeof b.object_id==='string'?b.object_id.slice(0,120):null,x,y,str(b.text,'Comment',10000),user.id,typeof b.page_id==='string'?b.page_id.slice(0,120):null);
    return { comment:{ ...comment,author_name:user.name } };
  }
  if (action === 'comment.resolve') {
    const threadId=identifier(b.thread_id,'Thread ID');
    const [comment] = await q(db, `select * from ${schema}.comments where id=$1 and board_id=$2 and parent_id is null`,threadId,boardId);
    if (!comment) fail(404,'Comment thread not found.');
    if (comment.author_id!==user.id) checkRank(board.rank,'editor');
    await q(db, `update ${schema}.comments set resolved=$3,updated_at=now() where id=$1 and board_id=$2`,threadId,boardId,!!b.resolved); return { ok:true };
  }
  if (action.startsWith('workshop.')) return workshopAction(db,user,board,b);
  if (action === 'snapshot.list') return { snapshots:await q(db, `select s.id,s.name,s.created_at,a.name as author_name from ${schema}.snapshots s join ${schema}.accounts a on a.id=s.created_by where board_id=$1 order by created_at desc limit 100`,boardId) };
  if (action === 'snapshot.create') {
    const doc = await loadDocument(db,boardId);
    try {
      const [snapshot] = await q(db, `insert into ${schema}.snapshots(board_id,name,update_data,created_by) values($1,$2,$3,$4) returning id,name,created_at`,boardId,str(b.name,'Version name',160,`Version ${now().slice(0,16).replace('T',' ')}`),Y.encodeStateAsUpdate(doc),user.id);
      return { snapshot };
    } finally { doc.destroy(); }
  }
  if (action === 'snapshot.restore') {
    const [snapshot] = await q(db, `select * from ${schema}.snapshots where id=$1 and board_id=$2`,identifier(b.snapshot_id,'Snapshot ID'),boardId);
    if (!snapshot) fail(404,'Version not found.');
    const copy=await createBoard(db,user,b.project_id?identifier(b.project_id,'Project ID'):board.project_id,str(b.name,'Board name',160,`${board.name} · restored`.slice(0,160)));
    await duplicateDocument(db,user,board,copy,new Uint8Array(snapshot.update_data)); return { board:await boardAccess(db,user,copy.id) };
  }
  fail(400,'Unknown action.');
}

async function workshopAction(db: Database, user: Row, board: Row, b: Row) {
  const boardId = board.id;
  // Lock the board for all state transitions, and the voting row before every quota change.
  if (b.action !== 'workshop.get') await q(db, `select id from ${schema}.boards where id=$1 for update`,boardId);
  const [clock] = await q(db, 'select now() as server_time');
  const serverMs = new Date(clock.server_time).getTime();
  if (b.action === 'workshop.timer') {
    const [active] = await q(db, `select * from ${schema}.workshops where board_id=$1 and kind='timer' order by created_at desc limit 1 for update`,boardId);
    const operation = b.operation ?? b.command ?? 'start';
    if (active && active.facilitator_id!==user.id && board.role!=='owner') fail(403,'Only the facilitator or board owner can control this timer.');
    if (operation === 'start') {
      const duration = Number(b.duration_ms ?? Number(b.seconds ?? 300)*1000);
      if (!Number.isFinite(duration) || duration<1000 || duration>86400000) fail(400,'Timer duration must be 1 second to 24 hours.');
      await q(db, `update ${schema}.workshops set state='ended',ended_at=now() where board_id=$1 and kind='timer' and state in ('running','paused')`,boardId);
      await q(db, `insert into ${schema}.workshops(board_id,kind,title,state,remaining_ms,ends_at,facilitator_id) values($1,'timer','Workshop timer','running',$2,$3,$4)`,boardId,duration,new Date(serverMs+duration),user.id);
    } else if (!active) fail(400,'Start a timer first.');
    else if (operation === 'pause') {
      if (active.state!=='running') fail(409,'Only a running timer can be paused.');
      await q(db, `update ${schema}.workshops set state='paused',remaining_ms=$2,ends_at=null where id=$1`,active.id,Math.max(0,new Date(active.ends_at??serverMs).getTime()-serverMs));
    }
    else if (operation === 'resume') {
      if (active.state!=='paused') fail(409,'Only a paused timer can be resumed.');
      await q(db, `update ${schema}.workshops set state='running',ends_at=$2 where id=$1`,active.id,new Date(serverMs+Number(active.remaining_ms??0)));
    }
    else if (operation === 'reset') await q(db, `update ${schema}.workshops set state='idle',remaining_ms=0,ends_at=null,ended_at=now() where id=$1`,active.id);
    else fail(400,'Unknown timer operation.');
  }
  if (b.action === 'workshop.vote_start') {
    const quota=Number(b.quota??5); const eligible=b.eligible??b.object_ids??[];
    if (!Number.isInteger(quota)||quota<1||quota>100||!Array.isArray(eligible)||!eligible.length||eligible.length>15000||eligible.some((id)=>typeof id!=='string'||id.length>120)) fail(400,'Choose eligible objects and a quota between 1 and 100.');
    const [active]=await q(db, `select id from ${schema}.workshops where board_id=$1 and kind='vote' and state='running'`,boardId);
    if (active) fail(409,'End the current voting session first.');
    const doc=await loadDocument(db,boardId);
    try { if (eligible.some((id:string)=>!doc.getMap('objects').has(id))) fail(400,'A selected object is no longer on this board.'); } finally { doc.destroy(); }
    await q(db, `insert into ${schema}.workshops(board_id,kind,title,state,quota,eligible,facilitator_id) values($1,'vote',$2,'running',$3,$4::text::jsonb,$5)`,boardId,str(b.title,'Voting title',160,'Team vote'),quota,JSON.stringify([...new Set(eligible)]),user.id);
  }
  if (b.action === 'workshop.vote_cast' || b.action === 'workshop.vote_end') {
    const [vote]=await q(db, `select * from ${schema}.workshops where board_id=$1 and kind='vote' and state='running' order by created_at desc limit 1 for update`,boardId);
    if (!vote || (b.workshop_id && b.workshop_id!==vote.id)) fail(409,'This voting session has ended.');
    if (b.action === 'workshop.vote_end') {
      if (vote.facilitator_id!==user.id && board.role!=='owner') fail(403,'Only the facilitator or board owner can end voting.');
      await q(db, `update ${schema}.workshops set state='ended',ended_at=now() where id=$1`,vote.id);
    } else {
      const objectId=str(b.object_id,'Object ID',120); const delta=Number(b.delta??1);
      if (![1,-1].includes(delta)||!vote.eligible.includes(objectId)) fail(400,'Choose an eligible object.');
      const [total]=await q(db, `select coalesce(sum(count),0)::integer as used from ${schema}.votes where workshop_id=$1 and user_id=$2`,vote.id,user.id);
      const [existing]=await q(db, `select count from ${schema}.votes where workshop_id=$1 and user_id=$2 and object_id=$3`,vote.id,user.id,objectId);
      if (delta>0 && total.used>=vote.quota) fail(409,'You have used all your votes.');
      if (delta<0 && !existing) fail(400,'You have no vote on this object.');
      if (delta<0 && existing.count===1) await q(db, `delete from ${schema}.votes where workshop_id=$1 and user_id=$2 and object_id=$3`,vote.id,user.id,objectId);
      else await q(db, `insert into ${schema}.votes(workshop_id,user_id,object_id,count) values($1,$2,$3,1) on conflict(workshop_id,user_id,object_id) do update set count=${schema}.votes.count+$4`,vote.id,user.id,objectId,delta);
    }
  }
  const sessions=await q(db, `select * from ${schema}.workshops where board_id=$1 order by created_at desc limit 30`,boardId);
  const timer=sessions.find((s)=>s.kind==='timer')??null;
  if (timer?.state==='running' && new Date(timer.ends_at).getTime()<=serverMs) { timer.state='ended';timer.remaining_ms=0; }
  const votes=[];
  for (const session of sessions.filter((s)=>s.kind==='vote')) {
    const mine=await q(db, `select object_id,count from ${schema}.votes where workshop_id=$1 and user_id=$2`,session.id,user.id);
    const results=session.state==='ended'?await q(db, `select object_id,sum(count)::integer as count from ${schema}.votes where workshop_id=$1 group by object_id order by count desc`,session.id):null;
    votes.push({ ...session,mine,results,used:mine.reduce((sum,row)=>sum+row.count,0) });
  }
  return { server_time:clock.server_time,privateVoting:votes.some((v)=>v.state==='running'),timer,vote:votes[0]??null,votes,history:votes.filter((v)=>v.state==='ended') };
}

async function importBundle(db: Database,user: Row,b: Row) {
  const bundle=b.bundle;
  if (!bundle||bundle.schemaVersion!==1||!Array.isArray(bundle.pages)||!Array.isArray(bundle.objects)||!Array.isArray(bundle.assets)||bundle.pages.length>100||bundle.objects.length>15000||bundle.assets.length>500) fail(400,'Invalid CanvasLab editable file.');
  const board=await createBoard(db,user,identifier(b.project_id,'Project ID'),str(b.name??bundle.board?.name,'Board name',160,'Imported board'));
  const ids=new Map<string,string>();
  for (const item of [...bundle.pages,...bundle.objects,...bundle.assets]) {
    if (!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||item.id.length>120||ids.has(item.id)) fail(400,'Editable file contains invalid or duplicate identifiers.');
    ids.set(item.id,newId());
  }
  for (const object of bundle.objects) for (const key of ['groupId','sectionId']) {
    const id=object[key]; if (typeof id==='string'&&id&&!ids.has(id)) ids.set(id,newId());
  }
  const assetIds=new Set(bundle.assets.map((a:Row)=>a.id)); let totalBytes=0;
  for (const asset of bundle.assets) {
    const data=fromBase64(asset.data,8388608);totalBytes+=data.byteLength;
    if (totalBytes>12000000) fail(413,'Imported assets exceed the 12 MB per-file limit.');
    const mime=detectImage(data); if (!mime||mime!==asset.mime) fail(400,'Editable file contains an invalid image.');
    await q(db, `insert into ${schema}.assets(id,board_id,name,mime,data,created_by) values($1,$2,$3,$4,$5,$6)`,ids.get(asset.id),board.id,str(asset.name,'Image name',255,'image'),mime,data,user.id);
  }
  const doc=new Y.Doc();
  try {
    for (const page of bundle.pages) {
      const item=new Y.Map();item.set('id',ids.get(page.id));item.set('name',str(page.name,'Page name',120,'Page'));item.set('order',Number.isFinite(page.order)?page.order:0);doc.getMap('pages').set(ids.get(page.id)!,item);
    }
    const pageIds=new Set(bundle.pages.map((p:Row)=>p.id));
    for (const object of bundle.objects) {
      if (!pageIds.has(object.pageId)) fail(400,'An object references a missing page.');
      if (object.assetId&&!assetIds.has(object.assetId)) fail(400,'An object references a missing image.');
      const item=new Y.Map();
      for (const [key,value] of Object.entries(object)) {
        if (['__proto__','prototype','constructor'].includes(key)) continue;
        if (key==='text') { const text=new Y.Text();text.insert(0,String(value??''));item.set(key,text); }
        else item.set(key,cloneValue(value,ids));
      }
      doc.getMap('objects').set(ids.get(object.id)!,item);
    }
    const update=await normalizeDocument(db,doc,board.id,user);
    await q(db, `insert into ${schema}.document_updates(board_id,update_id,update_data,created_by) values($1,$2,$3,$4)`,board.id,newId(),update,user.id);
    return {board:await boardAccess(db,user,board.id)};
  } finally { doc.destroy(); }
}
