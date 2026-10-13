// Ordered, append-only migrations. Never edit a shipped entry; add a new one.
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "portals",
    sql: `
      create table users (
        id text primary key,
        email text not null unique,
        name text not null default '',
        password_hash text,
        role text not null default 'member' check (role in ('member', 'readonly')),
        status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
        invite_hash text unique,
        invite_expires_at timestamptz,
        invited_by text,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz
      );

      create table operators (
        id text primary key,
        email text not null unique,
        name text not null default '',
        password_hash text not null,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz
      );

      create table mcp_tokens (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        name text not null,
        token_hash text not null unique,
        last4 text not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz,
        last_used_at timestamptz,
        revoked_at timestamptz
      );
      create index mcp_tokens_user_idx on mcp_tokens (user_id);

      create table usage_events (
        id bigserial primary key,
        user_id text references users(id) on delete set null,
        kind text not null check (kind in ('chat', 'mcp')),
        tool text,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        cost_micros bigint not null default 0,
        created_at timestamptz not null default now()
      );
      create index usage_events_created_idx on usage_events (created_at);
      create index usage_events_user_idx on usage_events (user_id, created_at);

      create table audit_log (
        id bigserial primary key,
        actor_type text not null check (actor_type in ('user', 'operator', 'system')),
        actor_id text,
        actor_name text not null,
        action text not null,
        target text not null default '',
        created_at timestamptz not null default now()
      );
      create index audit_log_created_idx on audit_log (created_at);
    `,
  },
];
