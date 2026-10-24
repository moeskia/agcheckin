import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = "https://agentrouter.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const res = JSON.parse(readFileSync(join(here, "login-probe-result.json"), "utf8"));
console.log("checked_in from login:", res.checked_in, "| session:", !!res.session);

const jar = { session: res.session };
// 获取 acw_tc（用登录后状态再访问一次 login 页? 直接先试 self）
const self = await fetch(`${SITE}/api/user/self`, {
  headers: { "User-Agent": UA, Accept: "application/json", "new-api-user": "123456", Cookie: `session=${res.session}`, Referer: `${SITE}/console`, "Cache-Control": "no-store" }
});
const j = await self.json();
if (j && j.success === true && j.data) {
  const d = j.data;
  const out = {
    ts: new Date().toISOString(),
    username: d.display_name || d.username,
    checked_in: d.checked_in,
    balance: Number((d.quota || 0) / 500000).toFixed(2),
    used: Number((d.used_quota || 0) / 500000).toFixed(2),
    session: res.session,
    loginChannel: "email"
  };
  writeFileSync(join(here, "email-login-state.json"), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify({ username: out.username, checked_in: out.checked_in, balance: out.balance, used: out.used }));
} else {
  console.log("self failed:", JSON.stringify(j).slice(0, 200));
}
