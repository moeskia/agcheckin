const SITE = "https://agentrouter.org";
const SELF_URL = `${SITE}/api/user/self`;
const QUOTA_PER_UNIT = 500000;
const REWARD_THRESHOLD = 20;
const MAX_ATTEMPTS = 3;
const HISTORY_LIMIT = 60;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function beijingDate(value = Date.now()) {
  return new Date(value + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function buildHeaders(env, session) {
  const cookies = [`session=${session}`];
  if (env.ACW_TC) cookies.push(`acw_tc=${env.ACW_TC}`);
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-store",
    Referer: `${SITE}/console`,
    "new-api-user": env.API_USER,
    Cookie: cookies.join("; "),
  };
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

async function signInEmail(env) {
  const result = { ok: false, checked_in: false, error: "" };
  if (!env.AGENTROUTER_EMAIL || !env.AGENTROUTER_PASSWORD) {
    result.error = "AGENTROUTER_EMAIL / AGENTROUTER_PASSWORD secret 未配置";
    return result;
  }
  const jar = {};
  try {
    const response = await fetch(`${SITE}/api/user/login`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Referer: `${SITE}/login`,
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        username: env.AGENTROUTER_EMAIL,
        password: env.AGENTROUTER_PASSWORD,
      }),
    });
    captureCookies(response, jar);
    let data = null;
    try {
      data = await response.json();
    } catch {}
    if (!data || data.success !== true || !data.data) {
      result.error = `密码登录失败: ${data?.message || "unknown"}`;
      return result;
    }
    result.ok = true;
    result.checked_in = Boolean(data.data.checked_in);
    result.session = jar.session || null;
  } catch (error) {
    result.error = String(error?.message || error).slice(0, 200);
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
  const signin = await signInEmail(env);
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
  if (!session || !env.API_USER) {
    return {
      ...base,
      ok: false,
      error: `${signin.error ? `${signin.error}; ` : ""}缺少可用 session 或 API_USER secret`,
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(SELF_URL, { headers: buildHeaders(env, session), redirect: "follow" });
      if (response.status === 200) {
        const data = await response.json();
        if (data && data.success === true && data.data) {
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
      if (response.status === 401) {
        return {
          ...base,
          ok: false,
          error: "HTTP 401: session cookie expired or invalid",
          ts: Date.now(),
        };
      }
      if (response.status === 403) {
        return {
          ...base,
          ok: false,
          error: "HTTP 403: blocked by WAF or invalid session",
          ts: Date.now(),
        };
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

async function storeResult(env, result) {
  if (!env.CHECKIN_KV) return result;
  try {
    const raw = await env.CHECKIN_KV.get("history");
    let history = [];
    if (raw) {
      try {
        history = JSON.parse(raw);
      } catch {}
    }
    if (!Array.isArray(history)) history = [];
    history = history.filter((item) => item && item.date !== result.date);
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
    await env.CHECKIN_KV.put("last", JSON.stringify(record));
    await env.CHECKIN_KV.put("history", JSON.stringify(history.slice(0, HISTORY_LIMIT)));
    return record;
  } catch {
    return result;
  }
}

export async function readState(env) {
  const state = { last: null, history: [] };
  if (!env.CHECKIN_KV) return state;
  try {
    const lastRaw = await env.CHECKIN_KV.get("last");
    if (lastRaw) {
      try {
        state.last = JSON.parse(lastRaw);
      } catch {}
    }
    const historyRaw = await env.CHECKIN_KV.get("history");
    if (historyRaw) {
      try {
        state.history = JSON.parse(historyRaw);
      } catch {}
    }
    if (!Array.isArray(state.history)) state.history = [];
  } catch {}
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
