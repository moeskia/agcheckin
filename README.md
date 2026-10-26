# AgentRouter 自动签到 Worker

Cloudflare Worker 每日通过邮箱密码登录 agentrouter.org 触发签到，快照余额与消耗，并提供统一状态页。

## 功能

- 每日 08:00（北京时间）使用邮箱密码真实登录签到。
- 保存新 session，并读取账号余额、已用额度与分组。
- 根据余额和消耗差值判断 `+$25` 奖励是否到账。
- 支持页面手动签到，提供亮暗色和移动端页面。
- 可选通用 Webhook 或 Telegram 通知。

## 接口

| 路由 | 方法 | 说明 |
|---|---|---|
| `/` | `GET` | 状态页面 |
| `/health` | `GET` | 返回 `OK` |
| `/api/status` | `GET` | 返回统一状态对象 |
| `/api/checkin` | `POST` | 执行签到并返回签到后的状态 |

状态对象统一包含 `ok`、`worker`、`now`、`nextRun`、`todayStatus`、四项 `stats`、`lastRun` 和 `history`。旧 `/checkin` 路径已移除。

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
