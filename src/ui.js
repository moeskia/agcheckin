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
  return items.map((item, i) => `<article class="record" data-disclosure="${esc(JSON.stringify([item.date, item.time]))}">` +
    `<time class="record-date">${esc(item.date)}</time><span class="record-time">${esc(item.time || "")}</span>${badge(item)}` +
    `<div class="record-content"><span class="record-message" id="record-${i}">${esc(item.message || "")}</span><button class="disclosure-btn" type="button" aria-expanded="false" aria-controls="record-${i}" aria-label="展开 ${esc(item.date)} 记录说明">展开</button></div></article>`).join("");
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
<script>document.documentElement.classList.add("js");</script>
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
button{min-height:44px;padding:0 18px;border:0;border-radius:8px;background:var(--primary);color:var(--on-primary);font:600 14px var(--font);cursor:pointer;white-space:nowrap}
button:disabled{opacity:.55;cursor:wait}
.overview{padding:20px 24px 0;border-top:1px solid var(--line)}
.status{display:flex;align-items:flex-start;gap:8px 10px;min-height:28px;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;justify-self:start;width:max-content;gap:6px;min-height:26px;padding:0 9px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap}
.badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.ok{background:var(--ok-bg);color:var(--ok)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge.warn{background:var(--warn-bg);color:var(--warn)}
.badge.wait{background:var(--wait-bg);color:var(--wait)}
.badge.info{background:var(--info-bg);color:var(--info)}
.hint{min-width:0;flex:1;color:var(--muted);font-size:13px;line-height:22px;overflow-wrap:anywhere}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}
.metric{min-width:0;padding:12px 13px;border:1px solid var(--line);border-radius:9px;background:var(--soft)}
.metric span{display:block;color:var(--muted);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric strong{display:block;margin-top:3px;font-size:18px;line-height:25px;font-weight:600;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.schedule{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:16px;padding:14px 0 18px;border-bottom:1px solid var(--line);color:var(--muted);font-size:13px;line-height:20px}
.schedule b{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.sep{width:3px;height:3px;border-radius:50%;background:var(--line)}
.note{margin-left:auto;color:var(--muted)}
.history{padding:20px 24px 24px}
.history-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.history-head h2{margin:0;font-size:16px;line-height:24px;font-weight:600}
.history-head span{color:var(--muted);font-size:12px}
.records{border-top:1px solid var(--line)}
.record{display:grid;grid-template-columns:96px 62px 68px minmax(0,1fr);align-items:center;gap:10px;min-width:0;padding:10px 8px;border-bottom:1px solid var(--line);transition:background-color .15s ease}
.record:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
.record.expanded{background:color-mix(in srgb,var(--primary) 8%,transparent)}
.record:nth-child(odd){background:var(--soft)}
.record:nth-child(odd):hover{background:color-mix(in srgb,var(--text) 5%,var(--soft))}
.record:nth-child(odd).expanded{background:color-mix(in srgb,var(--primary) 8%,transparent)}
.record-date{color:var(--text);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.record-time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.record .badge{min-height:23px;padding:0 7px;font-size:12px}
.record-content,.hint-wrap{display:flex;align-items:flex-start;gap:4px;min-width:0}
.hint-wrap{flex:1;min-width:150px}
.record-message{min-width:0;flex:1;color:var(--muted);font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.js .record-message,.js .hint{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.record.expanded .record-message,.hint-wrap.expanded .hint{display:block}
.disclosure-btn{display:none;flex:none;min-width:44px;min-height:32px;padding:2px 4px;background:transparent;color:var(--primary);font:500 12px var(--font)}
.js .disclosure-btn{display:inline-flex;align-items:center;justify-content:center}
.disclosure-btn:hover{background:var(--soft)}
button:focus-visible,a:focus-visible{outline:2px solid var(--primary);outline-offset:3px}
.note{overflow-wrap:anywhere}
.note[data-state="pending"],.note[data-state="error"]{color:var(--warn)}
@media(prefers-reduced-motion:reduce){.record,button{transition:none}}
.empty{height:52px;display:grid;place-items:center;color:var(--muted)}
@media(max-width:620px){.shell{width:100%;margin:0;border:0;border-radius:0;box-shadow:none}.head,.overview,.history{padding-left:16px;padding-right:16px}.head{padding-top:18px;padding-bottom:18px}.mark{width:38px;height:38px;border-radius:10px}.title h1{font-size:20px;line-height:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule{gap:6px 9px}.note{width:100%;margin-left:0}.record{grid-template-columns:96px minmax(0,1fr);align-items:start;gap:3px 10px;padding:11px 6px}.record-date{grid-column:1;grid-row:1}.record-time{grid-column:1;grid-row:2}.record .badge{grid-column:2;grid-row:1;justify-self:start}.record-content{grid-column:2;grid-row:2;text-align:left}.disclosure-btn{min-height:44px}.head{gap:10px}#checkin{padding:0 12px}}
</style>
</head>
<body>
<main class="shell" data-last-run="${esc(JSON.stringify(view.lastRun))}">
  <header class="head">
    <div class="mark"><img class="mark-img" src="${esc(ICON)}" alt="" width="26" height="26"></div>
    <div class="title"><h1>${esc(view.worker.name)}</h1><p>${esc(view.worker.site)} · 每日自动签到</p></div>
    <button id="checkin" type="button">立即签到</button>
  </header>
  <section class="overview">
    <div class="status" id="status-box">${badge(view.todayStatus)}<div class="hint-wrap" data-disclosure="hint"><span class="hint" id="status-hint">${esc(view.todayStatus.hint || "")}</span><button class="disclosure-btn" type="button" aria-expanded="false" aria-controls="status-hint" aria-label="展开状态说明">展开</button></div></div>
    <div class="metrics" id="metrics-box">
      ${view.stats.map((item) => `<div class="metric"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")}
    </div>
    <div class="schedule">
      <span>上次 <b id="last-time">${esc(view.lastRun.time || "—")}</b></span><span class="sep"></span>
      <span>下次 <b id="next-time">${esc(bjTime(view.nextRun))}</b></span>
      <span class="note" id="note" role="status" aria-live="polite"></span>
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
let pending=false;
let previousRun=document.querySelector("main").dataset.lastRun;
function escJs(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function bjTimeJs(v){
  if(v==null)return"—";
  const d=new Date(Number(v));
  return isNaN(d.getTime())?"—":new Date(d.getTime()+8*3600*1000).toISOString().slice(0,19).replace("T"," ");
}
function badgeJs(item){
  return '<span class="badge '+escJs(item.kind)+'"><span class="dot"></span>'+escJs(item.status||item.text)+'</span>';
}
function historyRowsJs(items) {
  return items.map((item, i) => \`<article class="record" data-disclosure="\${escJs(JSON.stringify([item.date, item.time]))}">\` +
    \`<time class="record-date">\${escJs(item.date)}</time><span class="record-time">\${escJs(item.time || "")}</span>\${badgeJs(item)}\` +
    \`<div class="record-content"><span class="record-message" id="record-\${i}">\${escJs(item.message || "")}</span><button class="disclosure-btn" type="button" aria-expanded="false" aria-controls="record-\${i}" aria-label="展开 \${escJs(item.date)} 记录说明">展开</button></div></article>\`).join("");
}
function setExpanded(container,expanded){
  container.classList.toggle("expanded",expanded);
  const button=container.querySelector(".disclosure-btn");
  button.setAttribute("aria-expanded",String(expanded));
  button.textContent=expanded?"收起":"展开";
  button.setAttribute("aria-label",button.getAttribute("aria-label").replace(/^(展开|收起)/,button.textContent));
}
document.addEventListener("click",e=>{
  const button=e.target.closest(".disclosure-btn");
  if(button)setExpanded(button.closest("[data-disclosure]"),button.getAttribute("aria-expanded")!=="true");
});
function validData(data){
  const kinds=["ok","bad","warn","wait","info"];
  return data&&data.ok===true&&data.todayStatus&&kinds.includes(data.todayStatus.kind)&&
    typeof data.todayStatus.text==="string"&&typeof data.todayStatus.hint==="string"&&
    Array.isArray(data.stats)&&data.stats.every(s=>s&&typeof s.label==="string"&&(typeof s.value==="string"||Number.isFinite(s.value)))&&
    data.lastRun&&typeof data.lastRun.time==="string"&&Number.isFinite(data.nextRun)&&
    Array.isArray(data.history)&&data.history.every(r=>r&&kinds.includes(r.kind)&&[r.date,r.time,r.status,r.message].every(v=>typeof v==="string"));
}
function updateView(data){
  const expanded=new Set(Array.from(document.querySelectorAll("[data-disclosure].expanded"),el=>el.dataset.disclosure));
  const active=document.activeElement?.closest("[data-disclosure]");
  const focusKey=active?active.dataset.disclosure:null;
  const statusBox=document.getElementById("status-box");
  statusBox.innerHTML=badgeJs(data.todayStatus)+'<div class="hint-wrap" data-disclosure="hint"><span class="hint" id="status-hint">'+escJs(data.todayStatus.hint)+'</span><button class="disclosure-btn" type="button" aria-expanded="false" aria-controls="status-hint" aria-label="展开状态说明">展开</button></div>';
  document.getElementById("metrics-box").innerHTML=data.stats.map(s=>'<div class="metric"><span>'+escJs(s.label)+'</span><strong>'+escJs(s.value)+'</strong></div>').join("");
  document.getElementById("last-time").textContent=data.lastRun.time||"—";
  document.getElementById("next-time").textContent=bjTimeJs(data.nextRun);
  const recent=data.history.slice(0,12);
  document.getElementById("history-count").textContent="最近 "+recent.length+" 条";
  document.getElementById("records-box").innerHTML=historyRowsJs(recent)||'<div class="empty">暂无记录</div>';
  document.querySelectorAll("[data-disclosure]").forEach(el=>{
    if(expanded.has(el.dataset.disclosure))setExpanded(el,true);
    if(el.dataset.disclosure===focusKey)el.querySelector(".disclosure-btn").focus({preventScroll:true});
  });
}
async function confirmResult(){
  const response=await fetch("/api/status",{cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const data=await response.json();
  if(!validData(data))throw new Error("状态数据格式异常");
  updateView(data);
  if(JSON.stringify(data.lastRun)!==previousRun&&data.lastRun.time&&data.lastRun.time!=="—"){
    pending=false;
    previousRun=JSON.stringify(data.lastRun);
    note.dataset.state="ok";
    note.textContent="已获取最新结果："+data.todayStatus.text;
  }else{
    note.dataset.state="pending";
    note.textContent="结果待确认，请稍后再次确认；不会重复提交签到";
  }
}
checkin.addEventListener("click",async()=>{
  if(checkin.disabled)return;
  checkin.disabled=true;
  checkin.setAttribute("aria-busy","true");
  note.dataset.state="loading";
  note.textContent=pending?"正在确认结果…":"正在签到…";
  const confirming=pending;
  try{
    if(confirming){await confirmResult();return;}
    pending=true;
    const response=await fetch("/api/checkin",{method:"POST",headers:{Accept:"application/json"},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    if(!validData(data))throw new Error(data?.error?.message||"签到结果格式异常");
    updateView(data);
    pending=false;
    previousRun=JSON.stringify(data.lastRun);
    note.dataset.state="ok";
    note.textContent=data.todayStatus.text;
  }catch(error){
    note.dataset.state="pending";
    note.textContent="结果待确认，正在查询状态…";
    if(!confirming){
      try{await confirmResult();}
      catch(e){note.textContent="结果待确认，暂时无法获取状态；请稍后确认";}
    }else{
      note.textContent="结果待确认，暂时无法获取状态；请稍后确认";
    }
  }finally{
    checkin.disabled=false;
    checkin.setAttribute("aria-busy","false");
    checkin.textContent=pending?"确认结果":"立即签到";
  }
});
</script>
</body>
</html>`;
}
