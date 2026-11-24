import assert from "node:assert/strict";
import test from "node:test";
import { runAndStore } from "../src/checkin.js";

const account = (id) => Response.json({ success: true, data: { id, quota: 500000, used_quota: 0 } });
const login = (id) => Response.json(
  { success: true, data: { id, quota: 500000, used_quota: 0 } },
  { headers: { "Set-Cookie": "session=fresh-session; Path=/" } },
);

async function run(responses, credentials = { AGENTROUTER_EMAIL: "test@example.com", AGENTROUTER_PASSWORD: "test-password" }) {
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    requests.push(options.headers);
    const response = responses[requests.length - 1];
    assert.ok(response, "unexpected extra request");
    return response;
  };
  try {
    const result = await runAndStore({
      ...credentials,
      CHECKIN_KV: { async get() { return null; }, async put() {} },
    });
    return { result, requests };
  } finally {
    globalThis.fetch = original;
  }
}

test("login id becomes the new-api-user header", async () => {
  const { result, requests } = await run([login(123456), account(123456)]);
  assert.equal(result.ok, true);
  assert.equal(result.signin.ok, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].Cookie, undefined);
  assert.equal(requests[1].Cookie, "session=fresh-session");
  assert.equal(requests[1]["new-api-user"], "123456");
});

test("stops on a rejected session cookie without retrying", async () => {
  const { result, requests } = await run([login(123456), Response.json({ success: false }, { status: 401 })]);
  assert.equal(result.ok, false);
  assert.match(result.error, /401: session cookie expired or invalid/);
  assert.equal(requests.length, 2);
});

test("does not call the account API when email login fails", async () => {
  const { result, requests } = await run([Response.json({ success: false, message: "invalid credentials" })]);
  assert.equal(result.ok, false);
  assert.match(result.error, /密码登录失败/);
  assert.equal(requests.length, 1);
});

test("does not call the account API without a login user id", async () => {
  const { result, requests } = await run([
    Response.json({ success: true, data: { checked_in: false } }, { headers: { "Set-Cookie": "session=fresh-session; Path=/" } }),
  ]);
  assert.equal(result.ok, false);
  assert.match(result.error, /未取得 session 或用户 id/);
  assert.equal(requests.length, 1);
});

test("reports missing email and password without any request", async () => {
  const { result, requests } = await run([], {});
  assert.equal(result.ok, false);
  assert.match(result.error, /AGENTROUTER_EMAIL \/ AGENTROUTER_PASSWORD secret 未配置/);
  assert.equal(requests.length, 0);
});
