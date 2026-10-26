import { beijingDate, readState, rewardStreak, runAndStore } from "./checkin.js";
import { renderPage } from "./ui.js";

const WORKER = {
  id: "ag",
  name: "AgentRouter",
  site: "agentrouter.org",
  cron: "0 0 * * *",
};
const REWARD_THRESHOLD = 20;

function bjTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function nextRun(cron, now = Date.now()) {
  const [minute, hour] = cron.split(/\s+/).map(Number);
  const current = new Date(now);
  const next = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
    hour,
    minute,
    0,
    0,
  ));
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

function money(value) {
  if (value == null) return "—";
  return `$${value}`;
}

function deltaValue(value) {
  if (value == null) return "—";
  return value >= 0 ? `+$${value}` : `-$${Math.abs(value)}`;
}

function recordKind(record) {
  if (!record) return "wait";
  return record.ok ? "ok" : "bad";
}

function recordStatus(record) {
  if (!record) return "等待运行";
  return record.ok ? "成功" : "失败";
}

function historyItem(record) {
  let message = "";
  if (!record.ok) {
    message = String(record.error || "").slice(0, 160);
  } else if (record.reward != null) {
    message = record.reward >= REWARD_THRESHOLD
      ? `奖励 +$25 到账 · 余额 ${money(record.balance)}`
      : `奖励未到账 · 余额 ${money(record.balance)}`;
  } else {
    message = `余额 ${money(record.balance)}`;
  }
  return {
    date: record.date || "—",
    time: record.ts ? bjTime(record.ts).slice(11) : "—",
    kind: recordKind(record),
    status: recordStatus(record),
    message,
  };
}

async function buildStatus(env, now = Date.now()) {
  const state = await readState(env);
  const last = state.last || state.history[0] || null;
  const today = beijingDate(now);
  const todayRecord = state.history.find((item) => item && item.date === today) || null;
  const signin = todayRecord?.signin || null;
  let todayStatus;
  if (!todayRecord) {
    todayStatus = {
      kind: "wait",
      text: "今日待检查",
      hint: last ? `上次 ${bjTime(last.ts)}` : "暂无记录",
    };
  } else if (!todayRecord.ok) {
    todayStatus = {
      kind: "bad",
      text: "检查失败",
      hint: String(todayRecord.error || "").slice(0, 120),
    };
  } else if (todayRecord.reward == null) {
    todayStatus = {
      kind: "info",
      text: "今日已检查",
      hint: "无上日对比，奖励状态待定",
    };
  } else if (todayRecord.reward >= REWARD_THRESHOLD) {
    todayStatus = {
      kind: "ok",
      text: "奖励 +$25 到账",
      hint: signin?.ok ? "自动登录签到已生效" : "检测到余额增加",
    };
  } else if (signin && signin.ok === false) {
    todayStatus = {
      kind: "warn",
      text: "自动签到失败",
      hint: String(signin.error || "").slice(0, 120),
    };
  } else {
    todayStatus = {
      kind: "warn",
      text: "奖励未到账",
      hint: "已登录但当日奖励未增加",
    };
  }
  return {
    ok: true,
    worker: WORKER,
    now,
    nextRun: nextRun(WORKER.cron, now),
    todayStatus,
    stats: [
      { label: "当前余额", value: last ? money(last.balance) : "—" },
      { label: "较上次", value: last ? deltaValue(last.delta) : "—" },
      { label: "已用", value: last ? money(last.used) : "—" },
      { label: "连续奖励", value: `${rewardStreak(state.history, today)} 天` },
    ],
    lastRun: {
      time: last ? bjTime(last.ts) : "—",
      kind: recordKind(last),
      status: recordStatus(last),
      message: last?.ok ? "" : String(last?.error || ""),
    },
    history: state.history.slice(0, 30).map(historyItem),
  };
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function methodNotAllowed(allow) {
  return json(
    { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" } },
    405,
    { Allow: allow },
  );
}

export default {
  async scheduled(event, env) {
    await runAndStore(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return new Response("OK", {
        headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "no-store" },
      });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return new Response(renderPage(await buildStatus(env)), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    if (url.pathname === "/api/status") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return json(await buildStatus(env));
    }
    if (url.pathname === "/api/checkin") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      await runAndStore(env);
      return json(await buildStatus(env));
    }
    return json({ ok: false, error: { code: "not_found", message: "Not Found" } }, 404);
  },
};
