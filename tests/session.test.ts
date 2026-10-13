import { test } from "node:test";
import assert from "node:assert/strict";
import { authConfigured, createSessionToken, safeEqual, SESSION_TTL_MS, verifySessionToken } from "../src/lib/session.ts";

const SECRET = "x".repeat(40);

test("a freshly created token verifies", async () => {
  const token = await createSessionToken(SECRET);
  assert.equal(await verifySessionToken(token, SECRET), true);
});

test("tokens signed with another secret are rejected", async () => {
  const token = await createSessionToken("y".repeat(40));
  assert.equal(await verifySessionToken(token, SECRET), false);
});

test("expired tokens are rejected", async () => {
  const issued = Date.now() - SESSION_TTL_MS - 1000;
  const token = await createSessionToken(SECRET, issued);
  assert.equal(await verifySessionToken(token, SECRET), false);
});

test("tampering with the expiry invalidates the signature", async () => {
  const token = await createSessionToken(SECRET);
  const [v, exp, sig] = token.split(".");
  const forged = `${v}.${Number(exp) + SESSION_TTL_MS}.${sig}`;
  assert.equal(await verifySessionToken(forged, SECRET), false);
});

test("malformed and missing tokens are rejected", async () => {
  for (const t of [undefined, "", "abc", "v1.123", "v2.9999999999999.sig", "v1.notanumber.sig"]) {
    assert.equal(await verifySessionToken(t, SECRET), false, String(t));
  }
});

test("safeEqual compares by value", async () => {
  assert.equal(await safeEqual("hunter2", "hunter2"), true);
  assert.equal(await safeEqual("hunter2", "hunter3"), false);
  assert.equal(await safeEqual("", "a"), false);
});

test("auth requires a password and a 32+ char secret", () => {
  assert.equal(authConfigured({}), false);
  assert.equal(authConfigured({ DEVKITS_ACCESS_PASSWORD: "p", DEVKITS_SESSION_SECRET: "short" }), false);
  assert.equal(authConfigured({ DEVKITS_ACCESS_PASSWORD: "p", DEVKITS_SESSION_SECRET: SECRET }), true);
});
