# AgentRouter 自动签到 Worker

每日用邮箱密码登录 agentrouter.org 完成签到，快照余额与消耗，并提供状态页与 JSON 接口。

定时执行由 cf-cron 通过 `Cron.run()` Service Binding 调用。本 Worker 的 `triggers.crons` **必须保持为空数组**，执行时间在 cf-cron 中配置。

## 功能

- 每日登录签到（cf-cron 现配置为 08:00 北京时间），记录账号余额与已用额度。
- 固定 `$25` 日奖励：用「余额变化 + 期间消耗」核验到账，余额被消耗拉低也不会误判。
- 连签天数按 `$20` 到账阈值统计，从今日或昨日往前回溯，中断多天归零。
- 状态页支持手动签到、亮暗色与移动端。

## 接口

| 路由 | 方法 | 说明 |
|---|---|---|
| `/` | `GET` | 状态页面 |
| `/health` | `GET` | 返回 `OK` |
| `/api/status` | `GET` | 返回统一状态对象（只读） |
| `/api/checkin` | `POST` | 执行签到并返回签到后的状态 |

状态对象包含 `ok`、`worker`、`now`、`nextRun`、`todayStatus`、四项 `stats`、`lastRun`、`history`，另提供 `lastResult`。旧 `/checkin` 路径已移除。

### 字段语义

- `todayStatus` 为 `{ kind, text, hint }`；`hint` 说明 `$25` 奖励到账情况、期间消耗、余额净变化，并保留自动登录错误。
- `lastResult` 对应最近保存的记录；无记录为 `null`，缺失数值为 `null`。
- `balanceDelta` = 余额变化、`consumeDelta` = 期间消耗、`inferredCredit` = 二者之和，单位美元，分别对应记录的 `delta`、`consume`、`reward`。
- 比较区间是运行时取用的上一条历史记录，不保证是昨日；无可比较数据时表示「暂无法判断」，不视为零奖励。
- `inferredCredit` 是核验值，不是可变日奖励；奖励文案始终按 `$25` 表达，连签按 `$20` 阈值统计。
- 历史说明保留当时余额；即使奖励已到账，也会显示自动登录失败原因。

## 认证流程

登录是唯一凭据来源：

1. `POST /api/user/login`（邮箱 + 密码）→ 从 `Set-Cookie` 取 session。
2. 用响应里的 `data.id` 作为 `new-api-user` 请求头（上游强制校验：缺失或与登录用户不匹配都返回 401）。
3. `GET /api/user/self` → 用户名、余额、已用额度。

登录失败即记录失败，不再请求账户接口、不做凭据切换。`401/403` 视为 session 失效并立即结束。网络错误、5xx、WAF 挑战页会重试：登录最多 2 次、账户请求最多 3 次，并捕获 `acw_tc` 等 Cookie 复用于后续请求。

## 配置

| 名称 | 类型 | 说明 |
|---|---|---|
| `AGENTROUTER_EMAIL` | Secret | 登录邮箱 |
| `AGENTROUTER_PASSWORD` | Secret | 登录密码 |
| `ACW_TC` | Secret | 可选，WAF Cookie |

KV 绑定 `CHECKIN_KV` 只保存 `last` 与 `history`。页面和接口当前无需访问令牌。

本机 `.agentrouter_creds.json`（已 gitignore）只保存 `ACW_TC`，键名与上表一致，可用 `npx wrangler secret bulk .agentrouter_creds.json` 上传。

## 目录

```text
agCheckin/
├── src/entry.js        Worker 入口：导出 default 与 Cron（cf-cron 调用点）
├── src/index.js        路由、状态对象组装
├── src/checkin.js      登录签到与存储
├── src/ui.js           状态页模板
├── src/icons.js        favicon
├── auto-login/         本机调试脚本（登录探测、self 校验）
├── test/               worker / auth / storage / cron 测试 + KV mock
├── package.json
└── wrangler.jsonc
```

## 本地验证

```powershell
npm install
npm test
npm run build
```

测试全部使用离线 mock，不读取真实凭据、不请求真实账号。

## 部署

```powershell
npx wrangler login
npx wrangler secret put AGENTROUTER_EMAIL
npx wrangler secret put AGENTROUTER_PASSWORD
npx wrangler deploy --dry-run
npx wrangler deploy
```

发布前备份 KV 的 `history`、`last`；发布后核对 `/health` 与 `/api/status`。回滚代码不会回滚 KV，不要为恢复旧行为清空历史或重置统计。

真实凭据只保存在本机忽略文件与 Cloudflare Secrets 中；项目每日执行一次登录签到和一次余额快照。

## 约束

- `src/entry.js` 是 `main`，必须导出 `Cron` 类与 `default`；`test/cron.test.mjs` 固定 `main = src/entry.js` 并断言 `triggers.crons` 为空，避免误删入口或改成自建定时。
- `src/index.js` 的 `scheduled` 处理器是兜底实现，本 Worker 不声明 cron，因此不会被平台触发。
- 发布验证：`npm ci` → `npm test` → `npm run build` → `npx wrangler deploy --dry-run`。

## 存储失败与数据兼容

只有 KV 原始读取结果为 `null` 时才初始化历史。内容为 JSON `null`、损坏 JSON、非数组历史或非对象记录时，停止写回并保留原数据。旧记录可以缺少可选字段；页面与 `GET /api/status` 保持只读，有效旧记录可继续展示，但会标记「历史数据异常」。

保存顺序为 `history` → `last`，前一步失败即停止后续写入。KV 不提供多键事务与跨请求读改写锁，失败后不做补偿覆盖，也不承诺并发写入的强一致性。

`POST /api/checkin` 保存失败返回 HTTP 503：`{ ok: false, error: { code: "storage_error", message }, result }`。`result` 是本次已取得的签到结果，「保存失败」不等于上游未签到，应刷新核实，不要自动重复提交。正常成功响应格式不变。定时任务的存储错误日志只记录阶段、键名与结果状态，随后抛出异常。
