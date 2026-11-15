import { WorkerEntrypoint } from "cloudflare:workers";
import { runAndStore } from "./checkin.js";
export { default } from "./index.js";

export class Cron extends WorkerEntrypoint {
  async run() {
    const result = await runAndStore(this.env);
    if (!result.ok || result.signin?.ok === false) throw new Error(result.error || result.signin?.error || "AgentRouter 签到失败");
    return result;
  }
}
