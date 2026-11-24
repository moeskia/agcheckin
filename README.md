# AgentRouter 自动签到 Worker

Cloudflare Worker 每日通过邮箱密码登录 agentrouter.org 触发签到，快照余额与消耗，并提供统一状态页。

定时执行由 cf-cron 通过 `Cron.run()` Service Binding 调用。本 Worker 的 `triggers.crons` 保持为空，执行时间在 cf-cron 中配置。

## 功能

- 每日 08:00（北京时间）使用邮箱密码真实登录签到。
- 保存新 session，并读取账号余额、已用额度与分组。
- 每日签到奖励固定 `$25`；通过余额变化 + 期间消耗核验到账，避免使用消耗导致余额下降时误判。沿用现有 `$20` 检测阈值。
- 支持页面手动签到，提供亮暗色和移动端页面。
- 可选通用 Webhook 或 Telegram 通知。

## 接口

| 路由 | 方法 | 说明 |
|---|---|---|
| `/` | `GET` | 状态页面 |
| `/health` | `GET` | 返回 `OK` |
| `/api/status` | `GET` | 返回统一状态对象 |
| `/api/checkin` | `POST` | 执行签到并返回签到后的状态 |

状态对象统一包含 `ok`、`worker`、`now`、`nextRun`、`todayStatus`、四项 `stats`、`lastRun` 和 `history`，另提供 `lastResult`。旧 `/checkin` 路径已移除。

### 结果说明与结构化数据

- `todayStatus.hint` 分别说明固定 `$25` 奖励的到账情况、期间消耗与余额净变化，并保留自动登录错误。
- `lastResult` 对应 `lastRun` 的最近保存记录；无记录时为 `null`，缺失数值为 `null`。
- `balanceDelta` 为余额变化，`consumeDelta` 为期间消耗，`inferredCredit` 为二者之和，单位均为美元；它们对应保存记录的 `delta`、`consume`、`reward`。
- 比较区间是运行时用于计算的上一条历史记录，不保证为昨日；没有可比较数据时暂无法判断，不视为零奖励。
- `inferredCredit` 是余额变化 + 期间消耗的核验值，不是可变的日奖励金额。每日奖励始终按 `$25` 表达；“连续奖励”沿用现有 `$20` 到账检测阈值统计。
- “连续奖励”从今日或昨日往前计算，中断多天后归零，不展示已经结束的旧连签作为当前连签。
- 历史说明保留当时余额；即使奖励已到账，也会显示自动登录失败信息。通知与底层签到流程不变。

## 目录

```text
agCheckin/
├── src/index.js
├── src/checkin.js
├── src/ui.js
├── test/worker.test.mjs
├── package.json
└── wrangler.jsonc
```

## 配置

| 名称 | 类型 | 说明 |
|---|---|---|
| `AGENTROUTER_EMAIL` | Secret | 登录邮箱 |
| `AGENTROUTER_PASSWORD` | Secret | 登录密码 |
| `ACW_TC` | Secret | 可选，WAF Cookie |
| `NOTIFY_URL` | Secret | 可选，Webhook 地址 |
| `TELEGRAM_BOT_TOKEN` | Secret | 可选，Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | Secret | 可选，Telegram Chat ID |

KV 绑定 `CHECKIN_KV` 只保存 `last` 和 `history`。页面和接口当前无需访问令牌。

`.agentrouter_creds.json` 保存 `ACW_TC`，键名与上表 secret 名一致，可用 `npx wrangler secret bulk .agentrouter_creds.json` 上传。

## 本地验证

```powershell
npm install
npm test
npm run build
```

## 部署

```powershell
npx wrangler login
npx wrangler secret bulk
npx wrangler deploy
```

真实凭据仅保存在本机忽略文件与 Cloudflare Secrets 中。项目每日只执行一次登录签到和一次余额快照。

## 存储失败与数据兼容

只有 KV 的原始读取结果为 `null` 时才初始化历史。存储内容为 JSON `null`、损坏 JSON、非数组历史或非对象记录时，停止写回并保留原数据。旧记录可以缺少可选字段。页面与 `GET /api/status` 保持只读，有效旧记录可以继续展示，但会明确标记“历史数据异常”。

`POST /api/checkin` 保存失败返回 HTTP 503，格式为 `{ ok: false, error: { code: "storage_error", message }, result }`。`result` 是已经取得的本次签到结果，不能将“保存失败”理解为上游没有签到；应刷新核实，不自动重复提交。正常成功响应格式不变。定时任务的存储错误日志只记录阶段、键名和结果状态，然后抛出异常。

保存顺序为 `history` → `last`，前一步失败时停止后续写入。 KV 不提供多键事务和跨请求读改写锁，失败后不执行补偿覆盖，本修复也不承诺并发写入的强一致性。

## 发布验证

各仓库独立安装、测试和部署，不依赖其他仓库的源码。

```powershell
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
```

生产发布前备份 `history`、`last`，先发布签到 Worker 的数据保护修复，再发布 Dashboard，最后发布局部重构。Plus 旧迁移键继续保留。回滚代码不会回滚 KV；不要为了恢复旧行为而清空历史或重置统计。

## 认证流程与探测脚本

登录只走邮箱密码：`POST /api/user/login` 成功后从 `Set-Cookie` 取 session，并用响应里的 `data.id` 作为 `new-api-user` 请求头（上游强制校验，缺失或与登录用户不匹配都返回 401），随后请求 `/api/user/self`。登录失败即记录失败，不再请求账户接口、不做凭据切换。网络、5xx、WAF 路径保留最多三次请求和 Cookie（含 `acw_tc`）捕获行为。

登录探测脚本只读取一次响应文本，再尝试解析 JSON；HTML 和普通文本仍能输出诊断摘要。自动测试使用离线响应，不读取真实凭据或请求真实账号。
