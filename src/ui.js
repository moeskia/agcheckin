const BRANDS = {
  jnn: { initial: "J", accent: "#2563eb" },
  gm: { initial: "G", accent: "#7c3aed" },
  plus: { initial: "P", accent: "#0891b2" },
  ag: { initial: "A", accent: "#16a34a" },
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function bjTime(value) {
  if (value == null || value === "") return "—";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Date(date.getTime() + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function badge(item) {
  return `<span class="badge ${esc(item.kind)}"><span class="dot"></span>${esc(item.status || item.text)}</span>`;
}

function stats(items) {
  return items.map((item) => `
    <div class="stat">
      <span class="key">${esc(item.label)}</span>
      <span class="value">${esc(item.value)}</span>
    </div>`).join("");
}

function historyRows(items) {
  return items.map((item) => `
    <tr>
      <td class="date">${esc(item.date)}<span>${esc(item.time || "")}</span></td>
      <td>${badge(item)}</td>
      <td class="message">${esc(item.message || "")}</td>
    </tr>`).join("");
}

export function renderPage(view) {
  const brand = BRANDS[view.worker.id] || { initial: "C", accent: "#0b57d0" };
  const rows = historyRows(view.history || []);
  const history = rows || `<tr><td colspan="3" class="empty">暂无记录</td></tr>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f7f9fc" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#131314" media="(prefers-color-scheme:dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%230b57d0'/%3E%3Cpath fill='%23fff' d='M7 12h10M12 7v10'/%3E%3C/svg%3E">
<title>${esc(view.worker.name)}</title>
<style>
:root{color-scheme:light;--font:"Roboto","Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;--primary:#0b57d0;--on-primary:#fff;--primary-low:#d3e3fd;--on-primary-low:#041e49;--surface:#f7f9fc;--card:#fff;--muted-surface:#f0f3f8;--text:#1f1f1f;--muted:#44474e;--line:#c4c6d0;--ok:#146c2e;--ok-bg:#c4eed0;--bad:#b3261e;--bad-bg:#f9dedc;--warn:#7a5900;--warn-bg:#ffdea0;--wait:#44464f;--wait-bg:#e1e2e8;--info:#00639b;--info-bg:#cde5ff;--shadow:0 1px 2px rgba(0,0,0,.14),0 1px 3px 1px rgba(0,0,0,.08);--radius:20px}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--primary:#a8c7fa;--on-primary:#062e6f;--primary-low:#0842a0;--on-primary-low:#d3e3fd;--surface:#131314;--card:#1b1b1f;--muted-surface:#25252a;--text:#e3e3e6;--muted:#c4c6cf;--line:#44474e;--ok:#86d89b;--ok-bg:#1b4e2b;--bad:#f2b8b5;--bad-bg:#8c1d18;--warn:#ffd27a;--warn-bg:#5c4300;--wait:#e2e2e9;--wait-bg:#44464f;--info:#9dcbff;--info-bg:#004a77;--shadow:0 1px 2px rgba(0,0,0,.6),0 2px 6px 2px rgba(0,0,0,.35)}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;font:14px/1.5 var(--font);color:var(--text);background:var(--surface);-webkit-font-smoothing:antialiased}
.appbar{position:sticky;top:0;z-index:10;border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent);background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(14px)}
.appbar-inner{max-width:960px;margin:auto;padding:16px;display:flex;align-items:center;gap:12px}
.app-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--primary-low);color:var(--on-primary-low);font-size:18px;font-weight:700}
.title{min-width:0}
.title h1{margin:0;font-size:20px;font-weight:600;line-height:26px}
.title p{margin:1px 0 0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.updated{margin-left:auto;text-align:right;color:var(--muted);font-size:11px;line-height:1.45}
.updated b{display:block;color:var(--text);font-size:12px;font-weight:500;font-variant-numeric:tabular-nums}
.wrap{max-width:960px;margin:auto;padding:20px 16px 44px}
.card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px}
.history-card{margin-top:16px}
.card-head{display:flex;align-items:center;gap:12px}
.avatar{width:44px;height:44px;flex:none;border-radius:14px;display:grid;place-items:center;background:${brand.accent};color:#fff;font-size:19px;font-weight:700}
.card-title{flex:1;min-width:0}
.card-title h2{margin:0;font-size:16px;font-weight:600;line-height:22px}
.card-title span{display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status{display:flex;align-items:flex-start;gap:10px;margin:18px 0 16px}
.badge{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap}
.badge .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.wait{background:var(--wait-bg);color:var(--wait)}
.badge.info{background:var(--info-bg);color:var(--info)}
.hint{flex:1;min-width:0;padding-top:3px;color:var(--muted);font-size:13px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.stat{min-width:0;padding:11px 12px;border-radius:12px;background:var(--muted-surface)}
.stat .key{display:block;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat .value{display:block;margin-top:3px;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--line) 70%,transparent);color:var(--muted);font-size:12px}
.foot b{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.foot .sep{width:3px;height:3px;border-radius:50%;background:var(--line)}
.actions{margin-left:auto;display:flex;align-items:center;gap:8px}
button{height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--primary);font:500 13px var(--font);cursor:pointer}
button.primary{border-color:transparent;background:var(--primary-low);color:var(--on-primary-low)}
button:disabled{opacity:.55;cursor:wait}
.action-note{color:var(--muted);font-size:12px}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.section-head h2{margin:0;font-size:15px;font-weight:600}
.section-head span{color:var(--muted);font-size:12px}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{padding:8px;background:var(--muted-surface);color:var(--muted);font-size:11px;font-weight:500;text-align:left}
th:first-child{border-radius:8px 0 0 8px}
th:last-child{border-radius:0 8px 8px 0}
td{padding:9px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);vertical-align:middle}
tr:last-child td{border-bottom:0}
th:first-child,td:first-child{width:132px}
th:nth-child(2),td:nth-child(2){width:88px}
td.date{font-variant-numeric:tabular-nums;white-space:nowrap}
td.date span{display:block;color:var(--muted);font-size:11px}
td .badge{height:24px;padding:0 8px;font-size:11px}
td.message{color:var(--muted);word-break:break-word;overflow-wrap:anywhere}
.empty{height:72px;text-align:center;color:var(--muted)}
@media(max-width:700px){.appbar-inner,.wrap{padding-left:12px;padding-right:12px}.updated{display:none}.card{padding:16px;border-radius:16px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.actions{width:100%;margin-left:0;flex-wrap:wrap}.actions button{flex:1 1 0;min-width:0;white-space:nowrap}.action-note{order:3;width:100%;min-height:0}.status{flex-direction:column;gap:7px}.hint{padding-top:0}th:first-child,td:first-child{width:96px}th:nth-child(2),td:nth-child(2){width:72px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<header class="appbar">
  <div class="appbar-inner">
    <div class="app-icon">${esc(brand.initial)}</div>
    <div class="title"><h1>${esc(view.worker.name)}</h1><p>${esc(view.worker.site)} · Cloudflare Worker</p></div>
    <div class="updated">北京时间<b>${esc(bjTime(view.now))}</b></div>
  </div>
</header>
<main class="wrap">
  <section class="card">
    <div class="card-head">
      <div class="avatar">${esc(brand.initial)}</div>
      <div class="card-title"><h2>今日状态</h2><span>${esc(view.worker.site)}</span></div>
    </div>
    <div class="status">${badge(view.todayStatus)}<div class="hint">${esc(view.todayStatus.hint || "")}</div></div>
    <div class="stats">${stats(view.stats)}</div>
    <div class="foot">
      <span>上次 <b>${esc(view.lastRun.time || "—")}</b></span><span class="sep"></span>
      <span>下次 <b>${esc(bjTime(view.nextRun))}</b></span>
      <div class="actions">
        <span class="action-note" id="action-note"></span>
        <button id="refresh" type="button">刷新</button>
        <button class="primary" id="checkin" type="button">立即签到</button>
      </div>
    </div>
  </section>
  <section class="card history-card">
    <div class="section-head"><h2>最近记录</h2><span>${esc((view.history || []).length)} 条</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>时间</th><th>结果</th><th>说明</th></tr></thead>
        <tbody>${history}</tbody>
      </table>
    </div>
  </section>
</main>
<script>
const refresh=document.getElementById("refresh");
const checkin=document.getElementById("checkin");
const note=document.getElementById("action-note");
refresh.addEventListener("click",()=>location.reload());
checkin.addEventListener("click",async()=>{
  checkin.disabled=true;
  refresh.disabled=true;
  note.textContent="正在签到";
  try{
    const response=await fetch("/api/checkin",{method:"POST",headers:{Accept:"application/json"}});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error?.message||"签到失败");
    location.reload();
  }catch(error){
    note.textContent=error instanceof Error?error.message:"签到失败";
    checkin.disabled=false;
    refresh.disabled=false;
  }
});
</script>
</body>
</html>`;
}
