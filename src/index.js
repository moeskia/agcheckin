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

function signinLabel(signin) {
  if (!signin) return "";
  if (signin.ok === false) return "自动登录失败";
  if (signin.checked_in) return "自动登录并签到成功";
  return "已自动登录";
}

function recordMessage(record) {
  if (!record.ok) {
    return String(record.error || "未知异常");
  }
  const parts = [signinLabel(record.signin)];
  if (record.reward != null) {
    parts.push(record.reward >= REWARD_THRESHOLD ? "奖励 +$25 到账" : "奖励未到账");
  } else if (record.delta != null) {
    parts.push(`变动 ${deltaValue(record.delta)}`);
  }
  if (record.balance != null) {
    parts.push(`余额 ${money(record.balance)}`);
  }
  if (record.used != null) {
    parts.push(`已用 ${money(record.used)}`);
  }
  return parts.filter(Boolean).join(" · ") || "正常";
}

function historyItem(record) {
  return {
    date: record.date || "—",
    time: record.ts ? bjTime(record.ts).slice(11) : "—",
    kind: recordKind(record),
    status: recordStatus(record),
    message: recordMessage(record),
  };
}

async function buildStatus(env, now = Date.now()) {
  const state = await readState(env);
  const last = state.last || state.history[0] || null;
  const latestBalance = state.history.find((item) => item?.ok && item.balance != null)
    || (last?.ok ? last : null);
  const today = beijingDate(now);
  const todayRecord = state.history.find((item) => item && item.date === today) || null;
  const signin = todayRecord?.signin || null;
  const identity = [
    last?.username ? `账号 ${last.username}` : "",
    last?.group ? `分组 ${last.group}` : "",
  ].filter(Boolean).join(" · ");
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
      hint: [signinLabel(signin), identity, "无上日对比，奖励状态待定"].filter(Boolean).join(" · "),
    };
  } else if (todayRecord.reward >= REWARD_THRESHOLD) {
    todayStatus = {
      kind: "ok",
      text: "奖励 +$25 到账",
      hint: [signinLabel(signin), identity, signin?.ok ? "" : "检测到余额增加"].filter(Boolean).join(" · "),
    };
  } else if (signin && signin.ok === false) {
    todayStatus = {
      kind: "warn",
      text: "自动签到失败",
      hint: [identity, String(signin.error || "").slice(0, 120)].filter(Boolean).join(" · "),
    };
  } else {
    todayStatus = {
      kind: "warn",
      text: "奖励未到账",
      hint: [signinLabel(signin), identity, "当日奖励未增加"].filter(Boolean).join(" · "),
    };
  }
  return {
    ok: true,
    worker: WORKER,
    now,
    nextRun: nextRun(WORKER.cron, now),
    todayStatus,
    stats: [
      { label: "当前余额", value: latestBalance ? money(latestBalance.balance) : "—" },
      { label: "较上次", value: latestBalance ? deltaValue(latestBalance.delta) : "—" },
      { label: "已用", value: latestBalance ? money(latestBalance.used) : "—" },
      { label: "连续奖励", value: `${rewardStreak(state.history, today)} 天` },
    ],
    lastRun: {
      time: last ? bjTime(last.ts) : "—",
      kind: recordKind(last),
      status: recordStatus(last),
      message: last ? recordMessage(last) : "",
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
