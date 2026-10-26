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
    <tr>
      <td class="date">${esc(item.date)}<span>${esc(item.time || "")}</span></td>
      <td>${badge(item)}</td>
      <td class="message">${esc(item.message || "")}</td>
    </tr>`).join("");
}

export function renderPage(view) {
  const historyItems = (view.history || []).slice(0, 12);
  const rows = historyRows(historyItems);
  const history = rows || `<tr><td colspan="3" class="empty">暂无记录</td></tr>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f5f6f8" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#151515" media="(prefers-color-scheme:dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%230b57d0'/%3E%3Cpath stroke='%23fff' stroke-width='2' d='M6 12h12M12 6v12'/%3E%3C/svg%3E">
<title>${esc(view.worker.name)}</title>
<style>
:root{color-scheme:light;--font:"Roboto","Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;--primary:#0b57d0;--on-primary:#fff;--surface:#f5f6f8;--panel:#fff;--text:#1f1f1f;--muted:#5f6368;--line:#dfe1e5;--ok:#146c2e;--ok-bg:#e3f4e8;--bad:#b3261e;--bad-bg:#f9e2e0;--warn:#755600;--warn-bg:#fff0c2;--wait:#4c4f55;--wait-bg:#eceef1;--info:#075c86;--info-bg:#e0f2fc}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--primary:#a8c7fa;--on-primary:#062e6f;--surface:#151515;--panel:#1f1f1f;--text:#e6e6e6;--muted:#b9bcc1;--line:#3b3b3d;--ok:#92dba5;--ok-bg:#163b22;--bad:#f2b8b5;--bad-bg:#4b211e;--warn:#ffd77a;--warn-bg:#443500;--wait:#d5d7db;--wait-bg:#37383c;--info:#9dd4f5;--info-bg:#173b4d}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;font:14px/1.5 var(--font);color:var(--text);background:var(--surface);-webkit-font-smoothing:antialiased}
.page{width:min(900px,calc(100% - 32px));margin:32px auto;background:var(--panel);border:1px solid var(--line);border-radius:10px}
.head{display:flex;align-items:center;gap:16px;padding:18px 20px;border-bottom:1px solid var(--line)}
.title{min-width:0;flex:1}
.title h1{margin:0;font-size:19px;line-height:26px;font-weight:600}
.title p{margin:1px 0 0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{height:36px;padding:0 16px;border:1px solid transparent;border-radius:6px;background:var(--primary);color:var(--on-primary);font:500 13px var(--font);cursor:pointer;white-space:nowrap}
button:disabled{opacity:.55;cursor:wait}
.summary{padding:18px 20px;border-bottom:1px solid var(--line)}
.status{display:flex;align-items:flex-start;gap:10px}
.badge{display:inline-flex;align-items:center;gap:6px;min-height:25px;padding:0 8px;border-radius:5px;font-size:12px;font-weight:600;white-space:nowrap}
.badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.wait{background:var(--wait-bg);color:var(--wait)}
.badge.info{background:var(--info-bg);color:var(--info)}
.hint{min-width:0;padding-top:2px;color:var(--muted);font-size:13px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:16px 0 0;padding:14px 0;border-block:1px solid var(--line)}
.metric{min-width:0;padding:0 12px;border-left:1px solid var(--line)}
.metric:first-child{padding-left:0;border-left:0}
.metric:last-child{padding-right:0}
.metric span{display:block;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric strong{display:block;margin-top:3px;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.schedule{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;color:var(--muted);font-size:12px}
.schedule b{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.sep{width:3px;height:3px;border-radius:50%;background:var(--line)}
.note{margin-left:auto;color:var(--muted)}
.history{padding:16px 20px 20px}
.history-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.history-head h2{margin:0;font-size:14px;font-weight:600}
.history-head span{color:var(--muted);font-size:11px}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{padding:7px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;font-weight:500;text-align:left}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
th:first-child,td:first-child{width:124px}
th:nth-child(2),td:nth-child(2){width:82px}
td.date{font-variant-numeric:tabular-nums;white-space:nowrap}
td.date span{display:block;color:var(--muted);font-size:11px}
td .badge{min-height:22px;padding:0 6px;font-size:11px}
td.message{color:var(--muted);word-break:break-word;overflow-wrap:anywhere}
.empty{height:64px;color:var(--muted);text-align:center}
@media(max-width:620px){.page{width:100%;margin:0;border:0;border-radius:0}.head,.summary,.history{padding-left:14px;padding-right:14px}.head{gap:10px}.title h1{font-size:17px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));padding:0;border-block:0}.metric{padding:12px 10px;border-left:0;border-bottom:1px solid var(--line)}.metric:nth-child(odd){padding-left:0}.metric:nth-child(even){border-left:1px solid var(--line)}.metric:nth-last-child(-n+2){border-bottom:0}.schedule{gap:6px 10px}.note{width:100%;margin-left:0}th:first-child,td:first-child{width:92px}th:nth-child(2),td:nth-child(2){width:70px}}
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <div class="title"><h1>${esc(view.worker.name)}</h1><p>${esc(view.worker.site)} · 每日自动签到</p></div>
    <button id="checkin" type="button">立即签到</button>
  </header>
  <section class="summary">
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
    <div class="history-head"><h2>最近记录</h2><span>最近 ${esc(historyItems.length)} 条</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>时间</th><th>结果</th><th>说明</th></tr></thead>
        <tbody>${history}</tbody>
      </table>
    </div>
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
