const SITE = "https://agentrouter.org";
const SELF_URL = `${SITE}/api/user/self`;
const QUOTA_PER_UNIT = 500000;
export const REWARD_THRESHOLD = 20;
export const DAILY_REWARD = 25;
const RETRY_DELAY_MS = 5000;
const MAX_ATTEMPTS = 3;
const MAX_LOGIN_ATTEMPTS = 2;
const HISTORY_LIMIT = 60;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryAfter(attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;
  await sleep(RETRY_DELAY_MS * attempt);
  return true;
}

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

function buildHeaders(env, session, jar = {}, userId) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-store",
    Referer: `${SITE}/console`,
    "new-api-user": String(userId),
  };
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
  const result = { ok: false, user_id: null, error: "" };
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
        if (await retryAfter(attempt, MAX_LOGIN_ATTEMPTS)) continue;
        return result;
      }
      if (data.success !== true || !data.data) {
        result.error = `密码登录失败: ${data.message || "unknown"}`;
        return result;
      }
      result.ok = true;
      result.session = jar.session || null;
      result.user_id = data.data.id ?? null;
      return result;
    } catch (error) {
      result.error = String(error?.message || error).slice(0, 200);
      if (await retryAfter(attempt, MAX_LOGIN_ATTEMPTS)) continue;
    }
  }
  return result;
}

async function doCheckin(env) {
  const date = beijingDate();
  const jar = {};
  const signin = await signInEmail(env, jar);
  const session = signin.ok && signin.session ? signin.session : null;

  const base = {
    date,
    ts: Date.now(),
    signin: {
      ok: signin.ok,
      error: signin.ok ? "" : signin.error,
    },
  };
  if (!session || signin.user_id == null) {
    return {
      ...base,
      ok: false,
      error: `${signin.error ? `${signin.error}; ` : ""}邮箱密码登录未取得 session 或用户 id`,
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(SELF_URL, { headers: buildHeaders(env, session, jar, signin.user_id), redirect: "follow" });
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
        if (await retryAfter(attempt, MAX_ATTEMPTS)) continue;
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
        return { ...base, ok: false, error: `HTTP ${response.status}: session cookie expired or invalid`, ts: Date.now() };
      }
      lastError = `HTTP ${response.status}`;
      if (response.status >= 500 && await retryAfter(attempt, MAX_ATTEMPTS)) continue;
      return { ...base, ok: false, error: lastError, ts: Date.now() };
    } catch (error) {
      lastError = error.message || String(error);
      if (await retryAfter(attempt, MAX_ATTEMPTS)) continue;
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

export async function runAndStore(env) {
  const result = await doCheckin(env);
  const record = await storeResult(env, result);
  return record;
}
