import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = "https://agentrouter.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const creds = JSON.parse(readFileSync(join(here, "..", ".agentrouter_login.json"), "utf8"));
const EMAIL = creds.email;
const PASS = creds.password;

const jar = {};
function capture(res) {
  try {
    const get = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const sc of get) {
      const m = sc.match(/^([^=;]+)=([^;]*)/);
      if (m) jar[m[1]] = m[2];
    }
  } catch (e) {}
}
const jarH = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

const bodies = [
  { email: EMAIL, password: PASS },
  { username: EMAIL, password: PASS },
  { email: EMAIL, password: PASS, turnstile: "" },
  { username: EMAIL, password: PASS, turnstile: "" }
];

for (let i = 0; i < bodies.length; i++) {
  try {
    const r = await fetch(`${SITE}/api/user/login`, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", "Content-Type": "application/json", Referer: `${SITE}/login`, "Cache-Control": "no-store", Cookie: jarH() },
      body: JSON.stringify(bodies[i])
    });
    capture(r);
    const raw = await r.text();
    let j = null;
    try { j = JSON.parse(raw); } catch (e) {}
    const summary = j ? { success: j.success, msg: String(j.message || "").slice(0, 80), hasData: !!j.data, dataKeys: j.data ? Object.keys(j.data).join(",") : "" } : { raw: raw.slice(0, 80) };
    console.log(`[body${i}] status=${r.status} ${JSON.stringify(summary)}`);
    if (j && j.success === true && j.data) {
      const out = { ok: true, bodyIndex: i, session: jar.session || null, id: j.data.id ?? null, keys: Object.keys(j.data) };
      if (j.data.checked_in != null) out.checked_in = j.data.checked_in;
      writeFileSync(join(here, "login-probe-result.json"), JSON.stringify(out, null, 2), "utf8");
      console.log("LOGIN OK body" + i, "keys:", Object.keys(j.data).join(","));
      break;
    }
  } catch (e) {
    console.log(`[body${i}] error ${String(e.message).slice(0, 100)}`);
  }
}
console.log("jar:", Object.keys(jar).join(","));
