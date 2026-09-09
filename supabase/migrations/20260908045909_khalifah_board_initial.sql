-- CanvasLab: deliberately private application schema in Khalifah Internal Tools.
-- All browser requests go through the session-authenticated CanvasLab service.
-- No application tables, functions, storage buckets, or policies are added to public.
create schema if not exists "Khalifah Board";
revoke all on schema "Khalifah Board" from public, anon, authenticated;

create table "Khalifah Board".accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) <= 254),
  name text not null check (length(name) between 1 and 80),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table "Khalifah Board".sessions (
  token_hash text primary key,
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index sessions_user_idx on "Khalifah Board".sessions(user_id);
create index sessions_expiry_idx on "Khalifah Board".sessions(expires_at);
create table "Khalifah Board".workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_creator_idx on "Khalifah Board".workspaces(created_by);
create table "Khalifah Board".workspace_memberships (
  workspace_id uuid not null references "Khalifah Board".workspaces(id) on delete cascade,
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  role text not null check (role in ('owner','editor','commenter','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index workspace_memberships_user_idx on "Khalifah Board".workspace_memberships(user_id,workspace_id);
create table "Khalifah Board".projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references "Khalifah Board".workspaces(id),
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  icon text not null default '✦' check (length(icon) <= 32),
  color text not null default '#635bff' check (color ~ '^#[a-fA-F0-9]{6}$'),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  trash_batch uuid
);
create index projects_workspace_idx on "Khalifah Board".projects(workspace_id,deleted_at);
create index projects_creator_idx on "Khalifah Board".projects(created_by);
create table "Khalifah Board".project_memberships (
  project_id uuid not null references "Khalifah Board".projects(id) on delete cascade,
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  role text not null check (role in ('owner','editor','commenter','viewer')),
  created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);
create index project_memberships_user_idx on "Khalifah Board".project_memberships(user_id,project_id);
create table "Khalifah Board".boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references "Khalifah Board".projects(id),
  name text not null check (length(name) between 1 and 160),
  created_by uuid not null references "Khalifah Board".accounts(id),
  thumbnail text check (length(thumbnail) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  trash_batch uuid
);
create index boards_project_idx on "Khalifah Board".boards(project_id,deleted_at,updated_at desc);
create index boards_creator_idx on "Khalifah Board".boards(created_by);
create table "Khalifah Board".board_grants (
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  role text not null check (role in ('owner','editor','commenter','viewer')),
  created_at timestamptz not null default now(),
  primary key(board_id,user_id)
);
create index board_grants_user_idx on "Khalifah Board".board_grants(user_id,board_id);
create table "Khalifah Board".share_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'viewer' check (role in ('editor','commenter','viewer')),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index share_links_board_idx on "Khalifah Board".share_links(board_id);
create index share_links_creator_idx on "Khalifah Board".share_links(created_by);
-- Link-derived access is separate: revoking a link removes exactly its grants.
create table "Khalifah Board".link_memberships (
  link_id uuid not null references "Khalifah Board".share_links(id) on delete cascade,
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(link_id,user_id)
);
create index link_memberships_user_idx on "Khalifah Board".link_memberships(user_id,link_id);
create table "Khalifah Board".document_updates (
  sequence bigint generated always as identity primary key,
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  update_id uuid not null,
  update_data bytea not null check (octet_length(update_data) <= 20000000),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now(),
  unique(board_id,update_id)
);
create index document_updates_board_idx on "Khalifah Board".document_updates(board_id,sequence);
create index document_updates_creator_idx on "Khalifah Board".document_updates(created_by);
create table "Khalifah Board".object_authors (
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  object_id text not null,
  user_id uuid not null references "Khalifah Board".accounts(id),
  author_name text not null,
  primary key(board_id,object_id)
);
create index object_authors_user_idx on "Khalifah Board".object_authors(user_id);
create table "Khalifah Board".assets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  name text not null check (length(name) between 1 and 255),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 12 and 8388608),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now()
);
create index assets_board_idx on "Khalifah Board".assets(board_id);
create index assets_creator_idx on "Khalifah Board".assets(created_by);
create table "Khalifah Board".comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  parent_id uuid references "Khalifah Board".comments(id),
  object_id text,
  x double precision,
  y double precision,
  text text not null check (length(text) between 1 and 10000),
  author_id uuid not null references "Khalifah Board".accounts(id),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_board_idx on "Khalifah Board".comments(board_id,created_at);
create index comments_parent_idx on "Khalifah Board".comments(parent_id);
create index comments_author_idx on "Khalifah Board".comments(author_id);
create table "Khalifah Board".workshops (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  kind text not null check (kind in ('timer','vote')),
  title text not null default '',
  state text not null check (state in ('running','paused','ended','idle')),
  quota integer check (quota between 1 and 100),
  eligible jsonb not null default '[]'::jsonb check (jsonb_typeof(eligible) = 'array'),
  remaining_ms bigint,
  ends_at timestamptz,
  facilitator_id uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index workshops_board_idx on "Khalifah Board".workshops(board_id,kind,created_at desc);
create index workshops_facilitator_idx on "Khalifah Board".workshops(facilitator_id);
create unique index one_active_vote_per_board_idx on "Khalifah Board".workshops(board_id) where kind = 'vote' and state = 'running';
create table "Khalifah Board".votes (
  workshop_id uuid not null references "Khalifah Board".workshops(id) on delete cascade,
  user_id uuid not null references "Khalifah Board".accounts(id),
  object_id text not null,
  count integer not null check (count between 1 and 100),
  primary key(workshop_id,user_id,object_id)
);
create index votes_user_idx on "Khalifah Board".votes(user_id);
create table "Khalifah Board".snapshots (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  update_data bytea not null check (octet_length(update_data) <= 20000000),
  created_by uuid not null references "Khalifah Board".accounts(id),
  created_at timestamptz not null default now()
);
create index snapshots_board_idx on "Khalifah Board".snapshots(board_id,created_at desc);
create index snapshots_creator_idx on "Khalifah Board".snapshots(created_by);
create table "Khalifah Board".preferences (
  user_id uuid not null references "Khalifah Board".accounts(id) on delete cascade,
  board_id uuid not null references "Khalifah Board".boards(id) on delete cascade,
  favorite boolean not null default false,
  recent_at timestamptz,
  primary key(user_id,board_id)
);
create index preferences_board_idx on "Khalifah Board".preferences(board_id);
create table "Khalifah Board".rate_limits (
  key text primary key,
  attempts integer not null default 1,
  window_at timestamptz not null default now()
);

-- Defense in depth. No public policies: the service is the authorization boundary.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'Khalifah Board' loop
    execute format('alter table %I.%I enable row level security', 'Khalifah Board', t.tablename);
    execute format('revoke all on table %I.%I from public, anon, authenticated', 'Khalifah Board', t.tablename);
  end loop;
end $$;
revoke all on all sequences in schema "Khalifah Board" from public, anon, authenticated;
alter default privileges in schema "Khalifah Board" revoke all on tables from public, anon, authenticated;
alter default privileges in schema "Khalifah Board" revoke all on sequences from public, anon, authenticated;
comment on schema "Khalifah Board" is 'CanvasLab application. Private session-authorized API; never expose through PostgREST.';
