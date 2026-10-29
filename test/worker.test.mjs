import assert from "node:assert/strict";
import test from "node:test";
import { beijingDate } from "../src/checkin.js";
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
  assert.deepEqual(Object.keys(view), ["ok", "worker", "now", "nextRun", "todayStatus", "stats", "lastRun", "history"]);
  assert.equal(view.ok, true);
  assert.deepEqual(Object.keys(view.worker), ["id", "name", "site", "cron"]);
  assert.equal(view.stats.length, 4);
  assert.deepEqual(Object.keys(view.stats[0]), ["label", "value"]);
  assert.deepEqual(Object.keys(view.todayStatus), ["kind", "text", "hint"]);
  assert.deepEqual(Object.keys(view.lastRun), ["time", "kind", "status", "message"]);
  if (view.history.length) assert.deepEqual(Object.keys(view.history[0]), ["date", "time", "kind", "status", "message"]);
}

const ROUTES = [
  ["/api/checkin", "GET", 405],
  ["/api/status", "POST", 405],
  ["/health", "POST", 405],
  ["/", "POST", 405],
  ["/checkin", "POST", 404],
  ["/signin", "POST", 404],
  ["/history", "GET", 404],
];

async function assertRouting(env) {
  for (const [path, method, want] of ROUTES) {
    assert.equal((await worker.fetch(new Request(`https://test${path}`, { method }), env)).status, want, `${method} ${path}`);
  }
}

test("agentrouter unified worker routes and check-in", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/api/user/login")) {
      assert.deepEqual(JSON.parse(options.body), { username: "test@example.com", password: "test-password" });
      return Response.json(
        {
          success: true,
          data: { checked_in: true, display_name: "Tester" },
        },
        { headers: { "Set-Cookie": "session=new-session; Path=/" } },
      );
    }
    assert.equal(options.headers.Cookie, "session=new-session");
    assert.equal(options.headers["new-api-user"], "1");
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
    assert.match(view.todayStatus.hint, /账号 Tester/);
    assert.match(view.todayStatus.hint, /分组 core/);
    assert.match(view.todayStatus.hint, /自动登录并签到成功/);
    assert.match(view.lastRun.message, /余额 \$200\.00/);
    assert.match(view.history[0].message, /自动登录并签到成功/);
    assert.ok(env.CHECKIN_KV.values.has("session"));

    await assertRouting(env);
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

test("agentrouter keeps the latest balance after a failed check", async () => {
  const now = Date.now();
  const history = [
    { date: beijingDate(now), ts: now, ok: false, error: "request failed" },
    {
      date: beijingDate(now - 86400000),
      ts: now - 86400000,
      ok: true,
      balance: "120.00",
      used: "30.00",
      delta: 25,
      reward: 25,
    },
  ];
  const env = {
    CHECKIN_KV: new MockKV({
      last: JSON.stringify(history[0]),
      history: JSON.stringify(history),
    }),
  };
  const view = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
  assert.equal(view.todayStatus.kind, "bad");
  assert.equal(view.stats[0].value, "$120.00");
  assert.equal(view.stats[1].value, "+$25");
  assert.equal(view.stats[2].value, "$30.00");
});
