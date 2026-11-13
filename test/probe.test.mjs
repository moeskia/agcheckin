import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import vm from "node:vm";

const source = readFileSync(new URL("../auto-login/email-login-probe.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("fileURLToPath(import.meta.url)", '"/offline/email-login-probe.mjs"');

for (const body of ['{"success":false,"message":"denied"}', "<html>challenge</html>", "plain response", "null"]) {
  test("login probe reads response once: " + body, async () => {
    const lines = [];
    let reads = 0;
    const context = {
      dirname, join,
      readFileSync: () => JSON.stringify({ email: "offline@example.test", password: "offline" }),
      writeFileSync: () => assert.fail("unexpected write"),
      console: { log: (...args) => lines.push(args.join(" ")) },
      fetch: async () => {
        const response = new Response(body);
        const text = response.text.bind(response);
        response.text = () => { reads += 1; return text(); };
        return response;
      },
    };
    await vm.runInNewContext("(async () => {" + source + "})()", context);
    assert.equal(reads, 4);
    assert.equal(lines.filter((line) => /status=200/.test(line)).length, 4);
    assert.ok(lines.every((line) => !/error|unusable|consumed/i.test(line)));
  });
}
