import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("cron entrypoint stays exported for the external cron worker", () => {
  const config = JSON.parse(read("../wrangler.jsonc"));
  const entry = read("../src/entry.js");

  assert.equal(config.main, "src/entry.js");
  assert.deepEqual(config.triggers.crons, []);
  assert.match(entry, /export class Cron extends WorkerEntrypoint/);
  assert.match(entry, /runAndStore\(this\.env\)/);
  assert.match(entry, /export \{ default \} from "\.\/index\.js"/);
});
