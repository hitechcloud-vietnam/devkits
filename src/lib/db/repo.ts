// Data access for both portals. Every function takes the Db so tests can pass an
// in-memory database. Secrets (passwords, MCP tokens, invite links) are stored hashed.
import { randomUUID } from "node:crypto";
import { MCP_TOKEN_PREFIX, generateSecret, hashPassword, sha256Hex } from "../crypto.ts";
import type { Db } from "./client.ts";

export type Role = "member" | "readonly";
export type UserStatus = "invited" | "active" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastSeenAt: string | null;
  inviteExpiresAt: string | null;
}

export interface UserListItem extends User {
  activeTokens: number;
  tokensExpiringSoon: number;
}

export interface Operator {
  id: string;
  email: string;
  name: string;
}

export interface McpToken {
  id: string;
  name: string;
  masked: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type RepoErrorCode = "exists" | "not_found" | "invalid" | "duplicate_name";

export class RepoError extends Error {
  readonly code: RepoErrorCode;
  constructor(code: RepoErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

function toUser(r: Row): User {
  return {
    id: r.id as string,
    email: r.email as string,
    name: (r.name as string) || "",
    role: r.role as Role,
    status: r.status as UserStatus,
    createdAt: iso(r.created_at)!,
    lastSeenAt: iso(r.last_seen_at),
    inviteExpiresAt: iso(r.invite_expires_at),
  };
}

function toToken(r: Row): McpToken {
  return {
    id: r.id as string,
    name: r.name as string,
    masked: `${MCP_TOKEN_PREFIX}…${r.last4 as string}`,
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at),
    lastUsedAt: iso(r.last_used_at),
    revokedAt: iso(r.revoked_at),
  };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const INVITE_TTL_DAYS = 7;

// ---------- Users ----------

export async function listUsers(db: Db): Promise<UserListItem[]> {
  const rows = await db.query(`
    select u.*,
      count(t.id) filter (where t.revoked_at is null and (t.expires_at is null or t.expires_at > now())) as active_tokens,
      count(t.id) filter (where t.revoked_at is null and t.expires_at > now() and t.expires_at <= now() + interval '7 days') as expiring_soon
    from users u left join mcp_tokens t on t.user_id = u.id
    group by u.id
    order by (u.status = 'invited'), coalesce(u.last_seen_at, u.created_at) desc`);
  return rows.map((r) => ({ ...toUser(r), activeTokens: Number(r.active_tokens), tokensExpiringSoon: Number(r.expiring_soon) }));
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  const [r] = await db.query("select * from users where id = $1", [id]);
  return r ? toUser(r) : null;
}

export async function getUserForLogin(db: Db, email: string): Promise<(User & { passwordHash: string | null }) | null> {
  const [r] = await db.query("select * from users where email = $1", [normalizeEmail(email)]);
  return r ? { ...toUser(r), passwordHash: (r.password_hash as string) ?? null } : null;
}

/** Creates an invitation, or renews it for a pending invitee. Returns the one-time invite secret. */
export async function inviteUser(db: Db, input: { email: string; role: Role; invitedBy: string }): Promise<{ user: User; inviteSecret: string }> {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RepoError("invalid", "Email không hợp lệ.");
  const secret = generateSecret("inv_", 24);
  const [existing] = await db.query("select * from users where email = $1", [email]);
  if (existing && existing.status !== "invited") throw new RepoError("exists", "Email này đã là người dùng.");
  const params = [sha256Hex(secret), `${INVITE_TTL_DAYS} days`, input.invitedBy, input.role];
  const [r] = existing
    ? await db.query(
        `update users set invite_hash = $1, invite_expires_at = now() + $2::interval, invited_by = $3, role = $4 where id = $5 returning *`,
        [...params, existing.id],
      )
    : await db.query(
        `insert into users (id, email, invite_hash, invite_expires_at, invited_by, role) values ($5, $6, $1, now() + $2::interval, $3, $4) returning *`,
        [...params, randomUUID(), email],
      );
  return { user: toUser(r), inviteSecret: secret };
}

export async function getInvite(db: Db, secret: string): Promise<User | null> {
  const [r] = await db.query("select * from users where invite_hash = $1 and status = 'invited' and invite_expires_at > now()", [sha256Hex(secret)]);
  return r ? toUser(r) : null;
}

export async function acceptInvite(db: Db, secret: string, input: { name: string; password: string }): Promise<User | null> {
  const [r] = await db.query(
    `update users set name = $2, password_hash = $3, status = 'active', invite_hash = null, invite_expires_at = null, last_seen_at = now()
     where invite_hash = $1 and status = 'invited' and invite_expires_at > now() returning *`,
    [sha256Hex(secret), input.name.trim(), await hashPassword(input.password)],
  );
  return r ? toUser(r) : null;
}

export async function updateUser(db: Db, id: string, patch: { role?: Role; status?: "active" | "suspended" }): Promise<User> {
  const [r] = await db.query(
    `update users set role = coalesce($2, role),
       status = case when $3::text is null then status when status = 'invited' then status else $3 end
     where id = $1 returning *`,
    [id, patch.role ?? null, patch.status ?? null],
  );
  if (!r) throw new RepoError("not_found", "Không tìm thấy người dùng.");
  return toUser(r);
}

export async function touchUser(db: Db, id: string): Promise<void> {
  await db.query("update users set last_seen_at = now() where id = $1", [id]);
}

// ---------- Operators ----------

export async function countOperators(db: Db): Promise<number> {
  const [r] = await db.query<{ n: string }>("select count(*) as n from operators");
  return Number(r.n);
}

export async function createOperator(db: Db, input: { email: string; name: string; password: string }): Promise<Operator> {
  const [r] = await db.query(
    "insert into operators (id, email, name, password_hash) values ($1, $2, $3, $4) returning id, email, name",
    [randomUUID(), normalizeEmail(input.email), input.name, await hashPassword(input.password)],
  );
  return r as unknown as Operator;
}

export async function getOperatorForLogin(db: Db, email: string): Promise<(Operator & { passwordHash: string }) | null> {
  const [r] = await db.query("select id, email, name, password_hash from operators where email = $1", [normalizeEmail(email)]);
  return r ? { id: r.id as string, email: r.email as string, name: r.name as string, passwordHash: r.password_hash as string } : null;
}

export async function getOperator(db: Db, id: string): Promise<Operator | null> {
  const [r] = await db.query("select id, email, name from operators where id = $1", [id]);
  return (r as unknown as Operator) ?? null;
}

export async function touchOperator(db: Db, id: string): Promise<void> {
  await db.query("update operators set last_seen_at = now() where id = $1", [id]);
}

// ---------- MCP tokens ----------

export async function listTokens(db: Db, userId: string): Promise<McpToken[]> {
  const rows = await db.query(
    `select * from mcp_tokens where user_id = $1 and revoked_at is null
     order by (expires_at is not null and expires_at <= now()), created_at desc`,
    [userId],
  );
  return rows.map(toToken);
}

export async function createToken(db: Db, input: { userId: string; name: string; expiresInDays: number | null }): Promise<{ token: McpToken; secret: string }> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new RepoError("invalid", "Tên token phải từ 1 đến 80 ký tự.");
  const [dupe] = await db.query("select 1 from mcp_tokens where user_id = $1 and lower(name) = lower($2) and revoked_at is null", [input.userId, name]);
  if (dupe) throw new RepoError("duplicate_name", "Bạn đã có token với tên này.");
  const secret = generateSecret(MCP_TOKEN_PREFIX);
  const [r] = await db.query(
    `insert into mcp_tokens (id, user_id, name, token_hash, last4, expires_at)
     values ($1, $2, $3, $4, $5, case when $6::int is null then null else now() + make_interval(days => $6::int) end) returning *`,
    [randomUUID(), input.userId, name, sha256Hex(secret), secret.slice(-4), input.expiresInDays],
  );
  return { token: toToken(r), secret };
}

export async function revokeToken(db: Db, userId: string, tokenId: string): Promise<boolean> {
  const rows = await db.query("update mcp_tokens set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id", [tokenId, userId]);
  return rows.length > 0;
}

/** Resolves a presented bearer token to its active owner and records the use. */
export async function authenticateToken(db: Db, secret: string): Promise<{ user: User; tokenId: string } | null> {
  if (!secret.startsWith(MCP_TOKEN_PREFIX)) return null;
  const [r] = await db.query(
    `update mcp_tokens t set last_used_at = now()
     from users u
     where t.token_hash = $1 and t.user_id = u.id and t.revoked_at is null
       and (t.expires_at is null or t.expires_at > now()) and u.status = 'active'
     returning t.id as token_id, u.*`,
    [sha256Hex(secret)],
  );
  return r ? { user: toUser(r), tokenId: r.token_id as string } : null;
}

// ---------- Usage & audit ----------

export async function recordUsage(
  db: Db,
  e: { userId: string | null; kind: "chat" | "mcp"; tool?: string; inputTokens?: number; outputTokens?: number; costMicros?: number },
): Promise<void> {
  await db.query(
    "insert into usage_events (user_id, kind, tool, input_tokens, output_tokens, cost_micros) values ($1, $2, $3, $4, $5, $6)",
    [e.userId, e.kind, e.tool ?? null, e.inputTokens ?? 0, e.outputTokens ?? 0, e.costMicros ?? 0],
  );
}

export interface UsageStats {
  activeUsers: number;
  chats: number;
  mcpCalls: number;
  costMicros: number;
}

async function statsBetween(db: Db, fromDays: number, toDays: number, userId?: string): Promise<UsageStats> {
  const [r] = await db.query(
    `select count(distinct user_id) as active_users,
       count(*) filter (where kind = 'chat') as chats,
       count(*) filter (where kind = 'mcp') as mcp_calls,
       coalesce(sum(cost_micros), 0) as cost
     from usage_events
     where created_at > now() - make_interval(days => $1::int) and created_at <= now() - make_interval(days => $2::int)
       and ($3::text is null or user_id = $3)`,
    [fromDays, toDays, userId ?? null],
  );
  return { activeUsers: Number(r.active_users), chats: Number(r.chats), mcpCalls: Number(r.mcp_calls), costMicros: Number(r.cost) };
}

export async function usageLast7Days(db: Db, userId?: string): Promise<{ current: UsageStats; previous: UsageStats }> {
  const [current, previous] = await Promise.all([statsBetween(db, 7, 0, userId), statsBetween(db, 14, 7, userId)]);
  return { current, previous };
}

export async function audit(db: Db, e: { actorType: "user" | "operator" | "system"; actorId?: string; actorName: string; action: string; target?: string }): Promise<void> {
  await db.query("insert into audit_log (actor_type, actor_id, actor_name, action, target) values ($1, $2, $3, $4, $5)", [
    e.actorType,
    e.actorId ?? null,
    e.actorName,
    e.action,
    e.target ?? "",
  ]);
}

export interface AuditEntry {
  actorType: "user" | "operator" | "system";
  actorName: string;
  action: string;
  target: string;
  createdAt: string;
}

export async function recentAudit(db: Db, limit = 5): Promise<AuditEntry[]> {
  const rows = await db.query("select * from audit_log order by created_at desc, id desc limit $1", [limit]);
  return rows.map((r) => ({
    actorType: r.actor_type as AuditEntry["actorType"],
    actorName: r.actor_name as string,
    action: r.action as string,
    target: r.target as string,
    createdAt: iso(r.created_at)!,
  }));
}
