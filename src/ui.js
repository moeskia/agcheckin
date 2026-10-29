import { ICON } from "./icons.js";

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
<link rel="icon" href="${esc(ICON)}">
<title>${esc(view.worker.name)}</title>
<style>
:root{color-scheme:light;--font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;--primary:#0b57d0;--on-primary:#fff;--page:#f4f6f8;--panel:#fff;--soft:#f8fafc;--text:#1b1f24;--muted:#626a73;--line:#e3e7eb;--ok:#176b34;--ok-bg:#e7f6ec;--bad:#ad2b23;--bad-bg:#fce9e7;--warn:#745600;--warn-bg:#fff3cf;--wait:#555d66;--wait-bg:#eef1f4;--info:#0b628b;--info-bg:#e5f3fa}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--primary:#a8c7fa;--on-primary:#062e6f;--page:#111214;--panel:#1b1c1f;--soft:#222429;--text:#eceef0;--muted:#b1b7be;--line:#34373c;--ok:#9be0ac;--ok-bg:#173c24;--bad:#f3b7b1;--bad-bg:#49211d;--warn:#ffd87a;--warn-bg:#433500;--wait:#d5d9dd;--wait-bg:#34373c;--info:#a3d9f4;--info-bg:#173c4e}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;font:15px/1.55 var(--font);color:var(--text);background:var(--page);-webkit-font-smoothing:antialiased}
.shell{width:min(900px,calc(100% - 32px));margin:36px auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 30px rgba(22,31,42,.055)}
.head{display:flex;align-items:center;gap:14px;padding:22px 24px}
.mark{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:11px;background:color-mix(in srgb,#16a34a 15%,var(--soft));border:1px solid color-mix(in srgb,#16a34a 28%,transparent);color:#fff;font-size:18px;font-weight:600;overflow:hidden}
.mark-img{width:26px;height:26px;object-fit:contain;border-radius:4px;display:block}
.title{flex:1;min-width:0}
.title h1{margin:0;font-size:22px;line-height:30px;font-weight:600}
.title p{margin:2px 0 0;color:var(--muted);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{height:40px;padding:0 18px;border:0;border-radius:8px;background:var(--primary);color:var(--on-primary);font:600 14px var(--font);cursor:pointer;white-space:nowrap}
button:disabled{opacity:.55;cursor:wait}
.overview{padding:20px 24px 0;border-top:1px solid var(--line)}
.status{display:flex;align-items:center;gap:10px;min-height:28px}
.badge{display:inline-flex;align-items:center;justify-self:start;width:max-content;gap:6px;min-height:26px;padding:0 9px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap}
.badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.wait{background:var(--wait-bg);color:var(--wait)}
.badge.info{background:var(--info-bg);color:var(--info)}
.hint{min-width:0;padding-top:0;color:var(--muted);font-size:14px;line-height:22px}
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
.record{display:grid;grid-template-columns:96px 62px 68px minmax(0,1fr);align-items:center;gap:10px;min-width:0;padding:10px 8px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .15s ease}
.record:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
.record.expanded{background:color-mix(in srgb,var(--primary) 8%,transparent)}
.record:nth-child(odd){background:var(--soft)}
.record:nth-child(odd):hover{background:color-mix(in srgb,var(--text) 5%,var(--soft))}
.record:nth-child(odd).expanded{background:color-mix(in srgb,var(--primary) 8%,transparent)}
.record-date{color:var(--text);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.record-time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.record .badge{min-height:23px;padding:0 7px;font-size:12px}
.record-message{min-width:0;color:var(--muted);font-size:13px;line-height:1.45;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.record.expanded .record-message,.record-message.expanded{display:block;-webkit-line-clamp:unset}
.hint{cursor:pointer}
.hint.expanded{display:block;-webkit-line-clamp:unset}
.empty{height:52px;display:grid;place-items:center;color:var(--muted)}
@media(max-width:620px){.shell{width:100%;margin:0;border:0;border-radius:0;box-shadow:none}.head,.overview,.history{padding-left:16px;padding-right:16px}.head{padding-top:18px;padding-bottom:18px}.mark{width:38px;height:38px;border-radius:10px}.title h1{font-size:20px;line-height:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule{gap:6px 9px}.note{width:100%;margin-left:0}.record{grid-template-columns:96px minmax(0,1fr);align-items:start;gap:3px 10px;padding:11px 6px}.record-date{grid-column:1;grid-row:1}.record-time{grid-column:1;grid-row:2}.record .badge{grid-column:2;grid-row:1;justify-self:start}.record-message{grid-column:2;grid-row:2;text-align:left}}
</style>
</head>
<body>
<main class="shell">
  <header class="head">
    <div class="mark"><img class="mark-img" src="${esc(ICON)}" alt="" width="26" height="26"></div>
    <div class="title"><h1>${esc(view.worker.name)}</h1><p>${esc(view.worker.site)} · 每日自动签到</p></div>
    <button id="checkin" type="button">立即签到</button>
  </header>
  <section class="overview">
    <div class="status" id="status-box">${badge(view.todayStatus)}<div class="hint" title="${esc(view.todayStatus.hint || "")}">${esc(view.todayStatus.hint || "")}</div></div>
    <div class="metrics" id="metrics-box">
      ${view.stats.map((item) => `<div class="metric"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")}
    </div>
    <div class="schedule">
      <span>上次 <b id="last-time">${esc(view.lastRun.time || "—")}</b></span><span class="sep"></span>
      <span>下次 <b id="next-time">${esc(bjTime(view.nextRun))}</b></span>
      <span class="note" id="note" aria-live="polite"></span>
    </div>
  </section>
  <section class="history">
    <div class="history-head"><h2>最近记录</h2><span id="history-count">最近 ${esc(recent.length)} 条</span></div>
    <div class="records" id="records-box">${history}</div>
  </section>
</main>
<script>
const checkin=document.getElementById("checkin");
const note=document.getElementById("note");
document.addEventListener("click",(e)=>{
  const row = e.target.closest(".record");
  if(row){
    row.classList.toggle("expanded");
    return;
  }
  const t=e.target.closest(".hint");
  if(t)t.classList.toggle("expanded");
});
function escJs(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function bjTimeJs(v){
  if(!v)return"—";
  const d=new Date(Number(v));
  if(isNaN(d.getTime()))return String(v);
  return new Date(d.getTime()+8*3600*1000).toISOString().slice(0,19).replace("T"," ");
}
function badgeJs(item){
  return '<span class="badge '+escJs(item.kind)+'"><span class="dot"></span>'+escJs(item.status||item.text)+'</span>';
}
checkin.addEventListener("click",async()=>{
  checkin.disabled=true;
  note.textContent="正在签到...";
  try{
    const response=await fetch("/api/checkin",{method:"POST",headers:{Accept:"application/json"}});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error?.message||"签到失败");
    note.textContent="签到成功！";
    if(data.todayStatus){
      const statusBox=document.getElementById("status-box");
      if(statusBox)statusBox.innerHTML=badgeJs(data.todayStatus)+'<div class="hint" title="'+escJs(data.todayStatus.hint||'')+'">'+escJs(data.todayStatus.hint||'')+'</div>';
    }
    if(data.stats){
      const metricsBox=document.getElementById("metrics-box");
      if(metricsBox)metricsBox.innerHTML=data.stats.map(s=>'<div class="metric"><span>'+escJs(s.label)+'</span><strong>'+escJs(s.value)+'</strong></div>').join("");
    }
    if(data.lastRun){
      const lastTime=document.getElementById("last-time");
      if(lastTime)lastTime.textContent=data.lastRun.time||"—";
    }
    if(data.nextRun){
      const nextTime=document.getElementById("next-time");
      if(nextTime)nextTime.textContent=bjTimeJs(data.nextRun);
    }
    if(data.history){
      const recent=data.history.slice(0,12);
      const countEl=document.getElementById("history-count");
      if(countEl)countEl.textContent="最近 "+recent.length+" 条";
      const recordsBox=document.getElementById("records-box");
      if(recordsBox){
        recordsBox.innerHTML=recent.length?recent.map(item=>'<article class="record"><time class="record-date">'+escJs(item.date)+'</time><span class="record-time">'+escJs(item.time||"")+'</span>'+badgeJs(item)+'<span class="record-message" title="'+escJs(item.message||"")+'">'+escJs(item.message||"")+'</span></article>').join(""):'<div class="empty">暂无记录</div>';
      }
    }
  }catch(error){
    note.textContent=error instanceof Error?error.message:"签到失败";
  }finally{
    checkin.disabled=false;
  }
});
</script>
</body>
</html>`;
}
