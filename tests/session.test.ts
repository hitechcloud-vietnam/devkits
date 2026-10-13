import { test } from "node:test";
import assert from "node:assert/strict";
import { authConfigured, createSessionToken, safeEqual, SESSION_TTL_MS, verifySessionToken } from "../src/lib/session.ts";

const SECRET = "x".repeat(40);
const ID = "3f1c2a9e-7b1d-4c55-9a0e-1b2c3d4e5f60";

test("a fresh token verifies for its own portal and returns the subject", async () => {
  const token = await createSessionToken(SECRET, "user", ID);
  assert.equal(await verifySessionToken(token, SECRET, "user"), ID);
});

test("a user-portal token is rejected by the operator portal and vice versa", async () => {
  const user = await createSessionToken(SECRET, "user", ID);
  const ops = await createSessionToken(SECRET, "ops", ID);
  assert.equal(await verifySessionToken(user, SECRET, "ops"), null);
  assert.equal(await verifySessionToken(ops, SECRET, "user"), null);
});

test("tokens signed with another secret are rejected", async () => {
  const token = await createSessionToken("y".repeat(40), "user", ID);
  assert.equal(await verifySessionToken(token, SECRET, "user"), null);
});

test("expired tokens are rejected, and operator sessions are shorter", async () => {
  assert.ok(SESSION_TTL_MS.ops < SESSION_TTL_MS.user);
  const token = await createSessionToken(SECRET, "ops", ID, Date.now() - SESSION_TTL_MS.ops - 1000);
  assert.equal(await verifySessionToken(token, SECRET, "ops"), null);
});

test("tampering with portal, subject or expiry invalidates the signature", async () => {
  const token = await createSessionToken(SECRET, "user", ID);
  const [v, portal, subject, exp, sig] = token.split(".");
  for (const forged of [
    [v, "ops", subject, exp, sig],
    [v, portal, "someone-else", exp, sig],
    [v, portal, subject, String(Number(exp) + 1e9), sig],
  ]) {
    assert.equal(await verifySessionToken(forged.join("."), SECRET, forged[1] as "user" | "ops"), null);
  }
});

test("malformed and missing tokens are rejected", async () => {
  for (const t of [undefined, "", "abc", "v1.123.sig", "v2.user.id.notanumber.sig", "v2.user.id.9999999999999"]) {
    assert.equal(await verifySessionToken(t, SECRET, "user"), null, String(t));
  }
});

test("subjects must be simple identifiers", async () => {
  await assert.rejects(createSessionToken(SECRET, "user", "a.b"));
});

test("safeEqual compares by value", async () => {
  assert.equal(await safeEqual("hunter2", "hunter2"), true);
  assert.equal(await safeEqual("hunter2", "hunter3"), false);
});

test("auth requires a 32+ char secret", () => {
  assert.equal(authConfigured({}), false);
  assert.equal(authConfigured({ DEVKITS_SESSION_SECRET: "short" }), false);
  assert.equal(authConfigured({ DEVKITS_SESSION_SECRET: SECRET }), true);
});
