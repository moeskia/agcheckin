import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { MockKV } from "./kv-mock.mjs";

const HISTORY = "history";
const old = { date: "2000-01-01", ok: true };
const newKV = () => new MockKV({ [HISTORY]: JSON.stringify([old]) });
function env(kv) { return { CHECKIN_KV: kv, AGENTROUTER_EMAIL: "test@example.com", AGENTROUTER_PASSWORD: "test-password" }; }
async function run(kv, action) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ success: true, consecutiveDays: 3, expBonus: 2, points: 20, message: "签到成功", data: { id: 123456, quota: 500000, used_quota: 0 } }, { headers: { "Set-Cookie": "session=test-session; Path=/" } });
  };
  try { return await action(env(kv), calls); } finally { globalThis.fetch = original; }
}
async function post(env) { return worker.fetch(new Request("https://test/api/checkin", { method: "POST" }), env); }

for (const value of ["{", "null", "{}", "[null]", '[{},null]']) {
  test("protects invalid history: " + value, async () => {
    const kv = newKV();
    kv.values.set(HISTORY, value);
    await run(kv, async (env) => {
      const view = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
      assert.equal(view.todayStatus.text, "历史数据异常");
      assert.equal(kv.writes.length, 0);
      const response = await post(env);
      const data = await response.json();
      assert.equal(response.status, 503);
      assert.equal(data.error.code, "storage_error");
      assert.ok(data.result);
      assert.equal(kv.values.get(HISTORY), value);
      assert.deepEqual(kv.writes, []);
    });
  });
}

test("read failure preserves historical data and returns the upstream result", async () => {
  const kv = newKV();
  kv.readFailure = HISTORY;
  const previous = kv.values.get(HISTORY);
  await run(kv, async (env) => {
    const response = await post(env);
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.result.status ?? data.result.ok, true);
    assert.deepEqual(kv.writes, []);
    assert.equal(kv.values.get(HISTORY), previous);
  });
});

for (const key of ["history","last"]) {
  test("stops after a failed write to " + key, async () => {
    const kv = newKV();
    kv.writeFailure = key;
    await run(kv, async (env, calls) => {
      const response = await post(env);
      const data = await response.json();
      assert.equal(response.status, 503);
      assert.equal(data.error.code, "storage_error");
      assert.equal(data.result.status ?? data.result.ok, true);
      assert.equal(kv.writes.at(-1), key);
      assert.equal(new Set(kv.writes).size, kv.writes.length);
      assert.equal(calls.filter((url) => url.endsWith("/api/user/self")).length, 1);
      if (key === HISTORY) assert.equal(JSON.parse(kv.values.get(HISTORY)).length, 1);
    });
  });
}

test("scheduled storage failure logs only stage, key and outcome", async () => {
  const kv = newKV();
  kv.writeFailure = HISTORY;
  const logs = [];
  const original = console.error;
  console.error = (line) => logs.push(JSON.parse(line));
  try {
    await run(kv, async (env) => assert.rejects(worker.scheduled({}, env), { code: "storage_error" }));
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0]).sort(), ["code", "key", "stage", "status"]);
    assert.equal(logs[0].stage, "write");
    assert.equal(logs[0].key, HISTORY);
  } finally { console.error = original; }
});
