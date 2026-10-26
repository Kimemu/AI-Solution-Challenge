/** 본문 확보와 영구 캐시. 전체 분석은 본문을 확보한 기사만 다음 단계로 넘깁니다. */
const { db } = require("./database");
const { contentFor, saveContent, failContent } = require("./article-content");
const { crawlMany } = require("./python-crawler");
let queue = Promise.resolve();
function ensureBodies(candidates, progress, crawler = crawlMany) {
  const task = queue.then(async () => {
    const missing = [],
      failures = [];
    let done = 0;
    for (const original of candidates) {
      const row = db()
        .prepare("SELECT data FROM signals WHERE id=?")
        .bind(original.id)
        .first();
      const signal = row ? JSON.parse(row.data) : original;
      const cached = contentFor(signal);
      if (cached) {
        saveContent(signal.id, cached);
        done++;
      } else missing.push(signal);
    }
    progress({ done, total: candidates.length, cached: done, failed: 0 });
    await crawler(missing, (result) => {
      if (result.ok) saveContent(result.id, result);
      else {
        failContent(result.id, result.error);
        failures.push({
          id: result.id,
          code: result.code,
          error: result.error,
        });
      }
      done++;
      progress({
        done,
        total: candidates.length,
        failed: failures.length,
        latestId: result.id,
        latestOk: result.ok,
      });
    });
    return failures;
  });
  queue = task.catch(() => {});
  return task;
}
function bodyBatches(articles) {
  const batches = [];
  let current = [],
    size = 0;
  for (const article of articles) {
    const length = contentFor(article)?.fullText.length || 0;
    if (current.length && (current.length >= 6 || size + length > 60000)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(article);
    size += length;
  }
  if (current.length) batches.push(current);
  return batches;
}
module.exports = { ensureBodies, bodyBatches };
