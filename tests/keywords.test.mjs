import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_SEED_NEWS = "0";
const {
  startKeywords,
  keywordJob,
  validateKeywords,
} = require("../server/keywords");
const { db } = require("../server/database");
const { getState } = require("../server/state");
const { closeDatabase } = require("../server/sqlite");

test("full article input is preserved, jobs serialize and only three valid keywords are stored", async (t) => {
  t.after(closeDatabase);
  const signal = (await getState()).signals[0];
  const fullText = "기사 전체 본문과 위성 관측에 관한 내용입니다. ".repeat(
    1800,
  );
  let finish;
  const job = await startKeywords(
    { id: signal.id, fullText },
    "test",
    (title, text) => {
      assert.equal(title, signal.title);
      assert.equal(text, fullText);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  assert.equal(job.status, "running");
  await assert.rejects(
    startKeywords({ id: signal.id, fullText }, "test"),
    /다른 기사 AI 분석/,
  );
  finish(["위성 관측", "메탄 탐지", "배출량 추정"]);
  while (keywordJob(job.id).status === "running")
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(keywordJob(job.id).status, "completed");
  const detail = await require("../server/api").handleApi(
    new Request("http://localhost/api/signals/" + signal.id),
    "signals/" + signal.id,
  );
  const saved = (await detail.json()).keywordAnalysis;
  assert.equal(saved.fullText, fullText);
  assert.equal(saved.model, "gpt-6-luna");
  assert.equal(saved.effort, "low");
  assert.equal(saved.keywords.length, 3);
  const failed = await startKeywords(
    { id: signal.id, fullText },
    "test",
    async () => {
      throw new Error("test failure");
    },
  );
  while (keywordJob(failed.id).status === "running")
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(keywordJob(failed.id).status, "failed");
  const row = await db()
    .prepare("SELECT data FROM signals WHERE id=?")
    .bind(signal.id)
    .first();
  assert.deepEqual(JSON.parse(row.data).keywordAnalysis, saved);
  await assert.rejects(
    startKeywords({ id: signal.id, fullText: "a".repeat(100001) }, "test"),
    /100,000/,
  );
  await assert.rejects(
    startKeywords({ id: "missing", fullText }, "test"),
    /찾을 수 없습니다/,
  );
  for (const keywords of [
    ["a", "b"],
    ["a", "A", "c"],
    ["a", "", "c"],
    ["a", 2, "c"],
  ])
    assert.throws(() => validateKeywords({ keywords }), /키워드 3개/);
});
