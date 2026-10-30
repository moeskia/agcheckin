# AgentRouter 自动签到 Worker

Cloudflare Worker 每日通过邮箱密码登录 agentrouter.org 触发签到，快照余额与消耗，并提供统一状态页。

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
| `API_USER` | Secret | `new-api-user` 请求头中的数字 ID |
| `SESSION_COOKIE` | Secret | 可选，session 兜底 |
| `ACW_TC` | Secret | 可选，WAF Cookie |
| `NOTIFY_URL` | Secret | 可选，Webhook 地址 |
| `TELEGRAM_BOT_TOKEN` | Secret | 可选，Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | Secret | 可选，Telegram Chat ID |

KV 绑定 `CHECKIN_KV` 保存 `session`、`last` 和 `history`。页面和接口当前无需访问令牌。

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
