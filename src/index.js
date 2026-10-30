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

function recordMessage(record, snapshot = true) {
  if (!record) return "";
  if (!record.ok) {
    const error = String(record.error || "检查失败");
    return /401|session.*(?:expired|invalid)|会话.*失效/i.test(error) ? `${error}；请更新登录凭据` : error;
  }
  const parts = [];
  if (record.reward == null) parts.push("每日奖励固定 $25，缺少可比较记录，到账待核验");
  else parts.push(record.reward >= REWARD_THRESHOLD ? "每日奖励 +$25 已到账" : "每日奖励 $25，尚未检测到到账");
  if (record.consume != null) parts.push(`期间消耗 $${Number(record.consume).toFixed(2)}`);
  if (record.delta != null) {
    const delta = Number(record.delta);
    parts.push(delta >= 0 ? `余额净增加 $${delta.toFixed(2)}` : `余额净减少 $${Math.abs(delta).toFixed(2)}`);
  }
  if (record.signin?.ok === false) parts.push(`自动登录失败：${record.signin.error || "请检查登录凭据"}`);
  if (snapshot && record.balance != null) parts.push(`当时余额 ${money(record.balance)}`);
  return parts.join(" · ");
}

function recordKind(record) {
  if (!record) return "wait";
  if (!record.ok) return "bad";
  if (record.signin?.ok === false) return "warn";
  if (record.reward == null) return "info";
  return record.reward >= REWARD_THRESHOLD ? "ok" : "warn";
}

function recordStatus(record, compact = false) {
  if (!record) return compact ? "待检" : "等待运行";
  if (!record.ok) return compact ? "失败" : "检查失败";
  if (record.signin?.ok === false) return compact ? "异常" : "自动登录失败";
  if (record.reward == null) return compact ? "待核" : "到账待核验";
  return record.reward >= REWARD_THRESHOLD ? (compact ? "到账" : "奖励已到账") : (compact ? "未到" : "奖励待到账");
}

function lastResult(record) {
  if (!record) return null;
  return {
    balanceDelta: record.delta == null ? null : Number(record.delta),
    consumeDelta: record.consume == null ? null : Number(record.consume),
    inferredCredit: record.reward == null ? null : Number(record.reward),
  };
}

function historyItem(record) {
  return {
    date: record.date || "—",
    time: record.ts ? bjTime(record.ts).slice(11) : "—",
    kind: recordKind(record),
    status: recordStatus(record, true),
    message: recordMessage(record),
  };
}

async function buildStatus(env, now = Date.now()) {
  const state = await readState(env);
  const last = state.last || state.history[0] || null;
  const latestBalance = state.history.find((item) => item?.ok && item.balance != null)
    || (last?.ok ? last : null);
  const today = beijingDate(now);
  const todayRecord = state.history.find((item) => item && item.date === today)
    || (last?.date === today ? last : null);
  const todayStatus = todayRecord
    ? { kind: recordKind(todayRecord), text: recordStatus(todayRecord), hint: recordMessage(todayRecord, false) }
    : { kind: "wait", text: "今日待检查", hint: last ? `上次 ${bjTime(last.ts)}` : "暂无记录" };
  return {
    ok: true,
    worker: WORKER,
    now,
    nextRun: nextRun(WORKER.cron, now),
    todayStatus,
    lastResult: lastResult(last),
    stats: [
      { label: "当前余额", value: latestBalance ? money(latestBalance.balance) : "—" },
      { label: "较上次", value: latestBalance ? deltaValue(latestBalance.delta) : "—" },
      { label: "已用", value: latestBalance ? money(latestBalance.used) : "—" },
      { label: "连续奖励", value: `${rewardStreak(state.history, today)} 天` },
    ],
    lastRun: {
      time: last ? bjTime(last.ts) : "—",
      kind: recordKind(last),
      status: recordStatus(last, true),
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
