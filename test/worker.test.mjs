import assert from "node:assert/strict";
import test from "node:test";
import { beijingDate, rewardStreak } from "../src/checkin.js";
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
  assert.deepEqual(Object.keys(view), ["ok", "worker", "now", "nextRun", "todayStatus", "lastResult", "stats", "lastRun", "history"]);
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
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /结果待确认/);

    const checked = await worker.fetch(new Request("https://test/api/checkin", { method: "POST" }), env);
    assert.equal(checked.status, 200);
    const view = await checked.json();
    assertView(view);
    assert.equal(view.todayStatus.kind, "info");
    assert.equal(view.stats[0].value, "$200.00");
    assert.equal(view.history.length, 1);
    assert.doesNotMatch(view.todayStatus.hint, /账号|分组|自动登录并签到|余额|已用/);
    assert.match(view.todayStatus.hint, /每日奖励固定 \$25，缺少可比较记录，到账待核验/);
    assert.deepEqual(view.lastResult, { balanceDelta: null, consumeDelta: null, inferredCredit: null });
    assert.match(view.lastRun.message, /余额 \$200\.00/);
    assert.match(view.history[0].message, /到账待核验/);
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


for (const [reward, signin, kind, text] of [
  [25, { ok: true }, "ok", "奖励已到账"],
  [30, { ok: true }, "ok", "奖励已到账"],
  [20, { ok: true }, "ok", "奖励已到账"],
  [19.99, { ok: true }, "warn", "奖励待到账"],
  [0, { ok: true }, "warn", "奖励待到账"],
  [-5, { ok: true }, "warn", "奖励待到账"],
  [null, { ok: true }, "info", "到账待核验"],
  [30, { ok: false, error: "密码登录失败" }, "warn", "自动登录失败"],
  [null, { ok: false, error: "密码登录失败" }, "warn", "自动登录失败"],
]) {
  test(`agentrouter explains inferred credit ${reward} and login ${signin.ok}`, async () => {
    const record = { date: beijingDate(), ts: Date.now(), ok: true, balance: "150.00", used: "12.50", delta: reward == null ? null : reward - 5, consume: reward == null ? null : 5, reward, signin, username: "Tester", group: "core" };
    const env = { CHECKIN_KV: new MockKV({ last: JSON.stringify(record), history: JSON.stringify([record]) }) };
    const before = [...env.CHECKIN_KV.values];
    const view = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
    assert.equal(view.todayStatus.kind, kind);
    assert.equal(view.todayStatus.text, text);
    assert.equal(view.history[0].status, !signin.ok ? "异常" : reward == null ? "待核" : reward >= 20 ? "到账" : "未到");
    assert.deepEqual(view.lastResult, { balanceDelta: record.delta, consumeDelta: record.consume, inferredCredit: reward });
    assert.doesNotMatch(view.todayStatus.hint, /账号|分组|当时余额|已用|已自动登录/);
    assert.match(view.history[0].message, /当时余额 \$150\.00/);
    assert.equal(view.history[0].message, view.lastRun.message);
    assert.equal(view.stats[3].label, "连续奖励");
    if (reward == null) assert.match(view.todayStatus.hint, /到账待核验/);
    else {
      assert.match(view.todayStatus.hint, /期间消耗 \$5\.00/);
      assert.match(view.todayStatus.hint, /余额净(?:增加|减少)/);
      assert.match(view.todayStatus.hint, reward >= 20 ? /每日奖励 \+\$25 已到账/ : /尚未检测到到账/);
    }
    if (!signin.ok) assert.match(view.todayStatus.hint, /自动登录失败：密码登录失败/);
    assert.deepEqual([...env.CHECKIN_KV.values], before);
  });
}

test("agentrouter leaves historical balance missing rather than borrowing today's value", async () => {
  const records = [{ date: beijingDate(), ts: Date.now(), ok: true, balance: "200.00", reward: 30 }, { date: "2026-01-01", ts: 1767225600000, ok: true, reward: null }];
  const env = { CHECKIN_KV: new MockKV({ history: JSON.stringify(records) }) };
  const view = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
  assert.doesNotMatch(view.history[1].message, /余额/);
  const empty = await (await worker.fetch(new Request("https://test/api/status"), { CHECKIN_KV: new MockKV() })).json();
  assert.equal(empty.lastResult, null);
});


for (const [consume, delta] of [[30, -5], [100, -75], [25, 0], [5, 20]]) {
  test(`agentrouter recognizes fixed $25 reward despite consumption ${consume} and balance delta ${delta}`, async () => {
    const record = { date: beijingDate(), ts: Date.now(), ok: true, balance: "150.00", delta, consume, reward: delta + consume, signin: { ok: true } };
    const env = { CHECKIN_KV: new MockKV({ history: JSON.stringify([record]) }) };
    const view = await (await worker.fetch(new Request("https://test/api/status"), env)).json();
    assert.equal(view.todayStatus.kind, "ok");
    assert.equal(view.todayStatus.text, "奖励已到账");
    assert.equal(view.history[0].status, "到账");
    assert.ok(view.todayStatus.hint.includes(`期间消耗 $${consume.toFixed(2)}`));
    assert.ok(view.todayStatus.hint.includes(`余额净${delta >= 0 ? "增加" : "减少"} $${Math.abs(delta).toFixed(2)}`));
    assert.deepEqual(view.lastResult, { balanceDelta: delta, consumeDelta: consume, inferredCredit: 25 });
  });
}


test("agentrouter stores consumption-adjusted reward when balance falls after check-in", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).endsWith("/api/user/login")
    ? Response.json({ success: true, data: { checked_in: true } }, { headers: { "Set-Cookie": "session=test-session; Path=/" } })
    : Response.json({ success: true, data: { quota: 97500000, used_quota: 40000000 } });
  try {
    const previous = { date: beijingDate(Date.now() - 86400000), ts: Date.now() - 86400000, ok: true, balance: "200.00", used: "50.00" };
    const env = { CHECKIN_KV: new MockKV({ history: JSON.stringify([previous]) }), AGENTROUTER_EMAIL: "test@example.com", AGENTROUTER_PASSWORD: "test-password", API_USER: "1" };
    const view = await (await worker.fetch(new Request("https://test/api/checkin", { method: "POST" }), env)).json();
    assert.equal(view.todayStatus.kind, "ok");
    assert.equal(view.todayStatus.text, "奖励已到账");
    assert.deepEqual(view.lastResult, { balanceDelta: -5, consumeDelta: 30, inferredCredit: 25 });
    assert.match(view.history[0].message, /期间消耗 \$30\.00 · 余额净减少 \$5\.00 · 当时余额 \$195\.00/);
    const stored = JSON.parse(env.CHECKIN_KV.values.get("last"));
    assert.equal(stored.reward, 25);
    assert.equal(stored.balance, "195.00");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


for (const [days, expected] of [
  [["2026-10-30", "2026-10-29"], 2],
  [["2026-10-29", "2026-10-28"], 2],
  [["2026-10-28", "2026-10-27"], 0],
  [["2026-10-30", "2026-10-28"], 1],
  [["2026-10-31"], 0],
  [[], 0],
]) {
  test(`agentrouter current reward streak respects recent continuity: ${days}`, () => {
    const history = days.map((date) => ({ date, ok: true, reward: 25 }));
    assert.equal(rewardStreak(history, "2026-10-30"), expected);
  });
}
