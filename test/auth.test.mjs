import assert from "node:assert/strict";
import test from "node:test";
import { runAndStore } from "../src/checkin.js";

async function check(statuses, credentials) {
  const requests = [];
  const values = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    requests.push(options.headers);
    const status = statuses[requests.length - 1];
    assert.ok(status, "unexpected extra request");
    return Response.json(status === 200 ? { success: true, data: { quota: 500000, used_quota: 0 } } : { success: false, message: "invalid credentials" }, { status });
  };
  try {
    const result = await runAndStore({ API_USER: "1", ...credentials, CHECKIN_KV: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { values.set(key, value); },
    } });
    return { result, requests };
  } finally { globalThis.fetch = original; }
}

test("token-only authentication starts with Authorization", async () => {
  const { result, requests } = await check([200], { AGENTROUTER_ACCESS_TOKEN: "test-token" });
  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].Authorization, "test-token");
  assert.equal(requests[0].Cookie, undefined);
});

for (const status of [401, 403]) {
  test("JSON " + status + " falls back from Cookie to Token", async () => {
    const { result, requests } = await check([status, 200], { SESSION_COOKIE: "session=test", AGENTROUTER_ACCESS_TOKEN: "test-token" });
    assert.equal(result.ok, true);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].Cookie);
    assert.equal(requests[1].Authorization, "test-token");
    assert.equal(requests[1].Cookie, undefined);
  });
  test("stops after all credentials reject authentication with " + status, async () => {
    const { result, requests } = await check([status, status], { SESSION_COOKIE: "session=test", AGENTROUTER_ACCESS_TOKEN: "test-token" });
    assert.equal(result.ok, false);
    assert.equal(requests.length, 2);
  });
}

test("invalid Cookie without Token stops after one request", async () => {
  const { result, requests } = await check([401], { SESSION_COOKIE: "session=test" });
  assert.equal(result.ok, false);
  assert.equal(requests.length, 1);
});
