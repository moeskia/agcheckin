const SITE = "https://agentrouter.org";
const SELF_URL = `${SITE}/api/user/self`;
const QUOTA_PER_UNIT = 500000;
const REWARD_THRESHOLD = 20;
const MAX_ATTEMPTS = 3;
const MAX_LOGIN_ATTEMPTS = 2;
const HISTORY_LIMIT = 60;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function beijingDate(value = Date.now()) {
  return new Date(value + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function looksLikeHtml(text) {
  return /^\s*<(?:!doctype|html)/i.test(String(text).slice(0, 200));
}

function cookieHeader(jar, extra = {}) {
  const cookies = { ...extra, ...jar };
  return Object.entries(cookies)
    .filter(([key, value]) => key && value != null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function buildHeaders(env, session, jar = {}, mode = "cookie") {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-store",
    Referer: `${SITE}/console`,
    "new-api-user": env.API_USER,
  };
  if (mode === "token" && env.AGENTROUTER_ACCESS_TOKEN) {
    headers.Authorization = env.AGENTROUTER_ACCESS_TOKEN;
    return headers;
  }
  const extra = {};
  if (session) extra.session = session;
  if (!jar.acw_tc && env.ACW_TC) extra.acw_tc = env.ACW_TC;
  const cookies = cookieHeader(jar, extra);
  if (cookies) headers.Cookie = cookies;
  return headers;
}

function captureCookies(response, jar) {
  try {
    const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    if (!lines.length) {
      const value = response.headers.get("set-cookie");
      if (value) lines.push(value);
    }
    for (const line of lines) {
      const match = line.match(/^([^=;]+)=([^;]*)/);
      if (match) jar[match[1]] = match[2];
    }
  } catch {}
}

async function signInEmail(env, jar = {}) {
  const result = { ok: false, checked_in: false, error: "" };
  if (!env.AGENTROUTER_EMAIL || !env.AGENTROUTER_PASSWORD) {
    result.error = "AGENTROUTER_EMAIL / AGENTROUTER_PASSWORD secret 未配置";
    return result;
  }
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt += 1) {
    try {
      const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Referer: `${SITE}/login`,
        "Cache-Control": "no-store",
      };
      const cookies = cookieHeader(jar);
      if (cookies) headers.Cookie = cookies;
      const response = await fetch(`${SITE}/api/user/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: env.AGENTROUTER_EMAIL,
          password: env.AGENTROUTER_PASSWORD,
        }),
      });
      captureCookies(response, jar);
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}
      if (!data) {
        result.error = looksLikeHtml(text)
          ? `登录返回 HTML（HTTP ${response.status}，疑似 WAF 拦截）`
          : `登录返回非 JSON（HTTP ${response.status}）`;
        if (attempt < MAX_LOGIN_ATTEMPTS) {
          await sleep(5000 * attempt);
          continue;
        }
        return result;
      }
      if (data.success !== true || !data.data) {
        result.error = `密码登录失败: ${data.message || "unknown"}`;
        return result;
      }
      result.ok = true;
      result.checked_in = Boolean(data.data.checked_in);
      result.session = jar.session || null;
      return result;
    } catch (error) {
      result.error = String(error?.message || error).slice(0, 200);
      if (attempt < MAX_LOGIN_ATTEMPTS) {
        await sleep(5000 * attempt);
        continue;
      }
    }
  }
  return result;
}

async function getSession(env) {
  if (!env.CHECKIN_KV) return null;
  try {
    return await env.CHECKIN_KV.get("session");
  } catch {
    return null;
  }
}

async function doCheckin(env) {
  const date = beijingDate();
  const jar = {};
  const signin = await signInEmail(env, jar);
  let session = signin.ok && signin.session ? signin.session : null;
  if (session && env.CHECKIN_KV) {
    try {
      await env.CHECKIN_KV.put("session", session);
    } catch {}
  }
  if (!session) session = await getSession(env);
  if (!session) session = env.SESSION_COOKIE;

  const base = {
    date,
    ts: Date.now(),
    signin: {
      ok: signin.ok,
      checked_in: signin.checked_in,
      error: signin.ok ? "" : signin.error,
    },
  };
  if (!env.API_USER || (!session && !env.AGENTROUTER_ACCESS_TOKEN)) {
    return {
      ...base,
      ok: false,
      error: `${signin.error ? `${signin.error}; ` : ""}缺少可用 session 或 API_USER secret`,
    };
  }

  let lastError = "";
  const rejected = new Set();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const modes = [session && "cookie", env.AGENTROUTER_ACCESS_TOKEN && "token"].filter((mode) => mode && !rejected.has(mode));
    const mode = modes[attempt === 2 && modes.length > 1 ? 1 : 0];
    try {
      const response = await fetch(SELF_URL, { headers: buildHeaders(env, session, jar, mode), redirect: "follow" });
      captureCookies(response, jar);
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}
      if (!data) {
        lastError = looksLikeHtml(text)
          ? `WAF challenge page (HTML, HTTP ${response.status})`
          : `non-JSON response (HTTP ${response.status})`;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(5000 * attempt);
          continue;
        }
        return { ...base, ok: false, error: `request failed: ${lastError}`, ts: Date.now() };
      }
      if (response.status === 200) {
        if (data.success === true && data.data) {
          const account = data.data;
          return {
            ...base,
            ok: true,
            username: account.display_name || account.username || String(account.id),
            balance: Number((account.quota || 0) / QUOTA_PER_UNIT).toFixed(2),
            used: Number((account.used_quota || 0) / QUOTA_PER_UNIT).toFixed(2),
            group: account.group || "",
            ts: Date.now(),
          };
        }
        return {
          ...base,
          ok: false,
          error: `API returned success=false: ${data?.message || "unknown"}`,
          ts: Date.now(),
        };
      }
      if (response.status === 401 || response.status === 403) {
        rejected.add(mode);
        lastError = `HTTP ${response.status}: ${mode === "token" ? "access token" : "session cookie"} expired or invalid`;
        if (attempt < MAX_ATTEMPTS && modes.some((candidate) => !rejected.has(candidate))) continue;
        return { ...base, ok: false, error: lastError, ts: Date.now() };
      }
      lastError = `HTTP ${response.status}`;
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await sleep(5000 * attempt);
        continue;
      }
      return { ...base, ok: false, error: lastError, ts: Date.now() };
    } catch (error) {
      lastError = error.message || String(error);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(5000 * attempt);
        continue;
      }
    }
  }
  return { ...base, ok: false, error: `request failed: ${lastError}`, ts: Date.now() };
}

function storageError(stage, key, result = null) {
  return Object.assign(new Error("历史数据异常或存储不可用，记录未完整保存，请刷新核实"), { code: "storage_error", stage, key, result });
}

async function readStored(env, key) {
  let raw;
  try { raw = await env.CHECKIN_KV.get(key); } catch { throw storageError("read", key); }
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw storageError("validate", key); }
  const object = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
  if (key === "history" ? !Array.isArray(value) || !value.every(object) : !object(value)) {
    throw Object.assign(storageError("validate", key), { rows: Array.isArray(value) ? value.filter(object) : [] });
  }
  return value;
}

async function storeResult(env, result) {
  let history;
  try { history = (await readStored(env, "history")) ?? []; } catch (error) {
    error.result = result;
    throw error;
  }
  history = history.filter((item) => item.date !== result.date);
  const previous = history[0] || null;
  let delta = null;
  let consume = null;
  let reward = null;
  if (previous && previous.balance != null && result.balance != null) {
    delta = Number((parseFloat(result.balance) - parseFloat(previous.balance)).toFixed(2));
  }
  if (previous && previous.used != null && result.used != null) {
    consume = Number((parseFloat(result.used) - parseFloat(previous.used)).toFixed(2));
  }
  if (delta != null && consume != null) reward = Number((delta + consume).toFixed(2));
  const record = { ...result, delta, consume, reward };
  history.unshift(record);
  for (const [key, value] of [["history", history.slice(0, HISTORY_LIMIT)], ["last", record]]) {
    try { await env.CHECKIN_KV.put(key, JSON.stringify(value)); } catch { throw storageError("write", key, record); }
  }
  return record;
}

export async function readState(env) {
  const state = { last: null, history: [], error: null };
  await Promise.all(["last", "history"].map(async (key) => {
    try { state[key] = (await readStored(env, key)) ?? state[key]; } catch (error) {
      state.error = error;
      if (key === "history") state.history = error.rows ?? [];
    }
  }));
  return state;
}

export function rewardStreak(history, today) {
  const days = new Set(
    history
      .filter((item) => item.ok && item.reward != null && item.reward >= REWARD_THRESHOLD)
      .map((item) => item.date),
  );
  let cursor = days.has(today) ? today : beijingDate(Date.parse(`${today}T00:00:00Z`) - 86400000);
  let length = 0;
  while (days.has(cursor)) {
    length += 1;
    cursor = beijingDate(Date.parse(`${cursor}T00:00:00Z`) - 86400000);
  }
  return length;
}

async function maybeNotify(env, result) {
  const delta = result.delta != null
    ? (result.delta >= 0 ? `+$${result.delta.toFixed(2)}` : `-$${Math.abs(result.delta).toFixed(2)}`)
    : "--";
  const consume = result.consume != null ? `$${Math.max(0, result.consume).toFixed(2)}` : "--";
  const reward = result.reward == null
    ? "未知"
    : (result.reward >= REWARD_THRESHOLD ? "已到账 (+$25)" : "未到账");
  const signin = result.signin?.ok
    ? (result.signin.checked_in ? "自动签到成功" : "已自动登录")
    : (result.signin?.ok === false ? `自动签到失败: ${result.signin.error}` : "未自动签到");
  const text = result.ok
    ? `AgentRouter 签到检查 ${result.date}\n账号: ${result.username}\n${signin}\n余额: $${result.balance} (已用 $${result.used})\n较上次: ${delta} · 期间消耗: ${consume}\n奖励: ${reward}`
    : `AgentRouter 签到检查失败 ${result.date}\n${result.error}`;
  const jobs = [];
  if (env.NOTIFY_URL) {
    jobs.push(fetch(env.NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: result.ok ? "签到检查" : "签到检查失败", content: text }),
    }).catch(() => {}));
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }).catch(() => {}));
  }
  await Promise.allSettled(jobs);
}

export async function runAndStore(env) {
  const result = await doCheckin(env);
  const record = await storeResult(env, result);
  await maybeNotify(env, record);
  return record;
}
