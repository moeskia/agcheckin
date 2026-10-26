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

function historyRows(items) {
  return items.map((item) => `
    <article class="record">
      <time class="record-date">${esc(item.date)}</time>
      <span class="record-time">${esc(item.time || "")}</span>
      ${badge(item)}
      <span class="record-message" title="${esc(item.message || "")}">${esc(item.message || "")}</span>
    </article>`).join("");
}

export function renderPage(view) {
  const brand = BRANDS[view.worker.id] || { initial: "C", accent: "#0b57d0" };
  const recent = (view.history || []).slice(0, 12);
  const rows = historyRows(recent);
  const history = rows || `<div class="empty">暂无记录</div>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f4f6f8" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#111214" media="(prefers-color-scheme:dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%230b57d0'/%3E%3Cpath stroke='%23fff' stroke-width='2' d='M6 12h12M12 6v12'/%3E%3C/svg%3E">
<title>${esc(view.worker.name)}</title>
<style>
:root{color-scheme:light;--font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;--primary:#0b57d0;--on-primary:#fff;--page:#f4f6f8;--panel:#fff;--soft:#f8fafc;--text:#1b1f24;--muted:#626a73;--line:#e3e7eb;--ok:#176b34;--ok-bg:#e7f6ec;--bad:#ad2b23;--bad-bg:#fce9e7;--warn:#745600;--warn-bg:#fff3cf;--wait:#555d66;--wait-bg:#eef1f4;--info:#0b628b;--info-bg:#e5f3fa}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--primary:#a8c7fa;--on-primary:#062e6f;--page:#111214;--panel:#1b1c1f;--soft:#222429;--text:#eceef0;--muted:#b1b7be;--line:#34373c;--ok:#9be0ac;--ok-bg:#173c24;--bad:#f3b7b1;--bad-bg:#49211d;--warn:#ffd87a;--warn-bg:#433500;--wait:#d5d9dd;--wait-bg:#34373c;--info:#a3d9f4;--info-bg:#173c4e}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;font:15px/1.55 var(--font);color:var(--text);background:var(--page);-webkit-font-smoothing:antialiased}
.shell{width:min(900px,calc(100% - 32px));margin:36px auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 30px rgba(22,31,42,.055)}
.head{display:flex;align-items:center;gap:14px;padding:22px 24px}
.mark{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:11px;background:${brand.accent};color:#fff;font-size:18px;font-weight:600}
.title{flex:1;min-width:0}
.title h1{margin:0;font-size:22px;line-height:30px;font-weight:600}
.title p{margin:2px 0 0;color:var(--muted);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{height:40px;padding:0 18px;border:0;border-radius:8px;background:var(--primary);color:var(--on-primary);font:600 14px var(--font);cursor:pointer;white-space:nowrap}
button:disabled{opacity:.55;cursor:wait}
.overview{padding:20px 24px 0;border-top:1px solid var(--line)}
.status{display:flex;align-items:flex-start;gap:10px;min-height:28px}
.badge{display:inline-flex;align-items:center;justify-self:start;width:max-content;gap:6px;min-height:26px;padding:0 9px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap}
.badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.wait{background:var(--wait-bg);color:var(--wait)}
.badge.info{background:var(--info-bg);color:var(--info)}
.hint{min-width:0;padding-top:2px;color:var(--muted);font-size:14px;line-height:22px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}
.metric{min-width:0;padding:12px 13px;border:1px solid var(--line);border-radius:9px;background:var(--soft)}
.metric span{display:block;color:var(--muted);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric strong{display:block;margin-top:3px;font-size:18px;line-height:25px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.schedule{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:16px;padding:14px 0 18px;border-bottom:1px solid var(--line);color:var(--muted);font-size:13px;line-height:20px}
.schedule b{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.sep{width:3px;height:3px;border-radius:50%;background:var(--line)}
.note{margin-left:auto;color:var(--muted)}
.history{padding:20px 24px 24px}
.history-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.history-head h2{margin:0;font-size:16px;line-height:24px;font-weight:600}
.history-head span{color:var(--muted);font-size:12px}
.records{border-top:1px solid var(--line)}
.record{display:grid;grid-template-columns:96px 62px 68px minmax(0,1fr);align-items:center;gap:10px;min-width:0;padding:10px 8px;border-bottom:1px solid var(--line)}
.record:nth-child(odd){background:var(--soft)}
.record-date{color:var(--text);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.record-time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.record .badge{min-height:23px;padding:0 7px;font-size:12px}
.record-message{min-width:0;color:var(--muted);font-size:13px;line-height:1.45;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty{height:52px;display:grid;place-items:center;color:var(--muted)}
@media(max-width:620px){.shell{width:100%;margin:0;border:0;border-radius:0;box-shadow:none}.head,.overview,.history{padding-left:16px;padding-right:16px}.head{padding-top:18px;padding-bottom:18px}.mark{width:38px;height:38px;border-radius:10px}.title h1{font-size:20px;line-height:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule{gap:6px 9px}.note{width:100%;margin-left:0}.record{grid-template-columns:1fr auto;gap:4px 8px;padding:11px 6px}.record-date{grid-column:1;grid-row:1}.record-time{grid-column:1;grid-row:2}.record .badge{grid-column:2;grid-row:1;justify-self:end}.record-message{grid-column:2;grid-row:2;text-align:right}}
</style>
</head>
<body>
<main class="shell">
  <header class="head">
    <div class="mark">${esc(brand.initial)}</div>
    <div class="title"><h1>${esc(view.worker.name)}</h1><p>${esc(view.worker.site)} · 每日自动签到</p></div>
    <button id="checkin" type="button">立即签到</button>
  </header>
  <section class="overview">
    <div class="status">${badge(view.todayStatus)}<div class="hint">${esc(view.todayStatus.hint || "")}</div></div>
    <div class="metrics">
      ${view.stats.map((item) => `<div class="metric"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")}
    </div>
    <div class="schedule">
      <span>上次 <b>${esc(view.lastRun.time || "—")}</b></span><span class="sep"></span>
      <span>下次 <b>${esc(bjTime(view.nextRun))}</b></span>
      <span class="note" id="note" aria-live="polite"></span>
    </div>
  </section>
  <section class="history">
    <div class="history-head"><h2>最近记录</h2><span>最近 ${esc(recent.length)} 条</span></div>
    <div class="records">${history}</div>
  </section>
</main>
<script>
const checkin=document.getElementById("checkin");
const note=document.getElementById("note");
checkin.addEventListener("click",async()=>{
  checkin.disabled=true;
  note.textContent="正在签到";
  try{
    const response=await fetch("/api/checkin",{method:"POST",headers:{Accept:"application/json"}});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error?.message||"签到失败");
    location.reload();
  }catch(error){
    note.textContent=error instanceof Error?error.message:"签到失败";
    checkin.disabled=false;
  }
});
</script>
</body>
</html>`;
}
