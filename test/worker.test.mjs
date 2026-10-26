import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

class MockKV {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function assertView(view) {
  assert.equal(view.ok, true);
  assert.deepEqual(Object.keys(view.worker), ["id", "name", "site", "cron"]);
  assert.equal(view.stats.length, 4);
  assert.deepEqual(Object.keys(view.todayStatus), ["kind", "text", "hint"]);
  assert.deepEqual(Object.keys(view.lastRun), ["time", "kind", "status", "message"]);
}

test("agentrouter unified worker routes and check-in", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/user/login")) {
      return Response.json(
        {
          success: true,
          data: { checked_in: true, display_name: "Tester" },
        },
        { headers: { "Set-Cookie": "session=new-session; Path=/" } },
      );
    }
    return Response.json({
      success: true,
      data: {
        display_name: "Tester",
        quota: 100000000,
        used_quota: 50000000,
        group: "core",
      },
    });
  };
  try {
    const env = {
      CHECKIN_KV: new MockKV(),
      AGENTROUTER_EMAIL: "test@example.com",
      AGENTROUTER_PASSWORD: "test-password",
      API_USER: "1",
    };
    assert.equal(await (await worker.fetch(new Request("https://test/health"), env)).text(), "OK");

    const empty = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
    assertView(empty);
    assert.equal(empty.worker.id, "ag");
    assert.equal(empty.todayStatus.kind, "wait");

    const html = await (await worker.fetch(new Request("https://test/"), env)).text();
    assert.match(html, /AgentRouter/);
    assert.match(html, /立即签到/);
    assert.match(html, /prefers-color-scheme:dark/);
    assert.doesNotMatch(html, /id="refresh"/);
    assert.match(html, /最近 0 条/);

    const checked = await worker.fetch(new Request("https://test/api/checkin", { method: "POST" }), env);
    assert.equal(checked.status, 200);
    const view = await checked.json();
    assertView(view);
    assert.equal(view.todayStatus.kind, "info");
    assert.equal(view.stats[0].value, "$200.00");
    assert.equal(view.history.length, 1);
    assert.ok(env.CHECKIN_KV.values.has("session"));

    assert.equal((await worker.fetch(new Request("https://test/api/checkin"), env)).status, 405);
    assert.equal((await worker.fetch(new Request("https://test/checkin", { method: "POST" }), env)).status, 404);
    assert.equal((await worker.fetch(new Request("https://test/signin", { method: "POST" }), env)).status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agentrouter records missing credentials and tolerates malformed KV", async () => {
  const env = {
    CHECKIN_KV: new MockKV({ history: "{", last: "{" }),
  };
  const empty = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
  assert.equal(empty.todayStatus.kind, "wait");
  const failed = await (await worker.fetch(new Request("https://test/api/checkin", { method: "POST" }), env)).json();
  assert.equal(failed.todayStatus.kind, "bad");
  assert.equal(failed.history.length, 1);
});
