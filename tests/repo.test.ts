import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb } from "../src/lib/db/client.ts";
import * as repo from "../src/lib/db/repo.ts";
import { verifyPassword } from "../src/lib/crypto.ts";

async function activeUser(db: Awaited<ReturnType<typeof createMemoryDb>>, email = "an@hitechcloud.vn") {
  const { inviteSecret } = await repo.inviteUser(db, { email, role: "member", invitedBy: "op" });
  return (await repo.acceptInvite(db, inviteSecret, { name: "Nguyễn Thanh An", password: "mat-khau-dai-1" }))!;
}

test("invite → accept activates the user and stores only a password hash", async () => {
  const db = await createMemoryDb();
  const { user, inviteSecret } = await repo.inviteUser(db, { email: " An@HiTechCloud.vn ", role: "member", invitedBy: "op" });
  assert.equal(user.status, "invited");
  assert.equal(user.email, "an@hitechcloud.vn");
  assert.ok(await repo.getInvite(db, inviteSecret));
  const accepted = await repo.acceptInvite(db, inviteSecret, { name: "An", password: "mat-khau-dai-1" });
  assert.equal(accepted?.status, "active");
  const login = await repo.getUserForLogin(db, "AN@hitechcloud.vn");
  assert.ok(login?.passwordHash?.startsWith("scrypt$"));
  assert.equal(await verifyPassword("mat-khau-dai-1", login!.passwordHash), true);
  assert.equal(await verifyPassword("sai", login!.passwordHash), false);
  // The invite link is single-use.
  assert.equal(await repo.acceptInvite(db, inviteSecret, { name: "x", password: "mat-khau-dai-2" }), null);
});

test("inviting an existing active user is refused; re-inviting a pending one renews the link", async () => {
  const db = await createMemoryDb();
  await activeUser(db);
  await assert.rejects(repo.inviteUser(db, { email: "an@hitechcloud.vn", role: "member", invitedBy: "op" }), { code: "exists" });
  const first = await repo.inviteUser(db, { email: "ha@hitechcloud.vn", role: "member", invitedBy: "op" });
  const second = await repo.inviteUser(db, { email: "ha@hitechcloud.vn", role: "readonly", invitedBy: "op" });
  assert.equal(await repo.getInvite(db, first.inviteSecret), null);
  assert.equal((await repo.getInvite(db, second.inviteSecret))?.role, "readonly");
});

test("MCP tokens: secret shown once, stored hashed, usable until revoked or user suspended", async () => {
  const db = await createMemoryDb();
  const user = await activeUser(db);
  const { token, secret } = await repo.createToken(db, { userId: user.id, name: "Claude Code · MacBook", expiresInDays: 90 });
  assert.ok(secret.startsWith("dk_live_"));
  assert.equal(token.masked, `dk_live_…${secret.slice(-4)}`);
  const rows = await db.query<{ token_hash: string }>("select token_hash from mcp_tokens");
  assert.notEqual(rows[0].token_hash, secret);

  assert.equal((await repo.authenticateToken(db, secret))?.user.id, user.id);
  assert.equal(await repo.authenticateToken(db, "dk_live_wrong"), null);
  assert.ok((await repo.listTokens(db, user.id))[0].lastUsedAt);

  await assert.rejects(repo.createToken(db, { userId: user.id, name: "claude code · macbook", expiresInDays: null }), { code: "duplicate_name" });

  await repo.updateUser(db, user.id, { status: "suspended" });
  assert.equal(await repo.authenticateToken(db, secret), null);
  await repo.updateUser(db, user.id, { status: "active" });
  assert.ok(await repo.authenticateToken(db, secret));

  assert.equal(await repo.revokeToken(db, user.id, token.id), true);
  assert.equal(await repo.authenticateToken(db, secret), null);
  assert.equal((await repo.listTokens(db, user.id)).length, 0);
});

test("expired tokens are rejected", async () => {
  const db = await createMemoryDb();
  const user = await activeUser(db);
  const { secret } = await repo.createToken(db, { userId: user.id, name: "old", expiresInDays: 1 });
  await db.query("update mcp_tokens set expires_at = now() - interval '1 minute'");
  assert.equal(await repo.authenticateToken(db, secret), null);
});

test("user list counts active and soon-expiring tokens", async () => {
  const db = await createMemoryDb();
  const user = await activeUser(db);
  await repo.createToken(db, { userId: user.id, name: "a", expiresInDays: 3 });
  await repo.createToken(db, { userId: user.id, name: "b", expiresInDays: null });
  await repo.inviteUser(db, { email: "hoa@gmail.com", role: "member", invitedBy: "op" });
  const list = await repo.listUsers(db);
  assert.equal(list.length, 2);
  assert.equal(list[0].email, "an@hitechcloud.vn");
  assert.equal(list[0].activeTokens, 2);
  assert.equal(list[0].tokensExpiringSoon, 1);
  assert.equal(list[1].status, "invited");
});

test("usage stats split the last 7 days from the 7 before", async () => {
  const db = await createMemoryDb();
  const user = await activeUser(db);
  await repo.recordUsage(db, { userId: user.id, kind: "chat", inputTokens: 1000, outputTokens: 200, costMicros: 8000 });
  await repo.recordUsage(db, { userId: user.id, kind: "mcp", tool: "github_repo_overview" });
  await repo.recordUsage(db, { userId: user.id, kind: "chat" });
  await db.query("update usage_events set created_at = now() - interval '10 days' where id = (select max(id) from usage_events)");
  const { current, previous } = await repo.usageLast7Days(db);
  assert.deepEqual(current, { activeUsers: 1, chats: 1, mcpCalls: 1, costMicros: 8000 });
  assert.equal(previous.chats, 1);
  assert.equal((await repo.usageLast7Days(db, "someone-else")).current.chats, 0);
});

test("operators and audit log", async () => {
  const db = await createMemoryDb();
  assert.equal(await repo.countOperators(db), 0);
  const op = await repo.createOperator(db, { email: "Ops@HiTechCloud.vn", name: "Vận hành", password: "mat-khau-van-hanh" });
  assert.equal((await repo.getOperatorForLogin(db, "ops@hitechcloud.vn"))?.id, op.id);
  await repo.audit(db, { actorType: "operator", actorId: op.id, actorName: op.name, action: "mời", target: "an@hitechcloud.vn" });
  const [entry] = await repo.recentAudit(db, 5);
  assert.equal(entry.action, "mời");
});
