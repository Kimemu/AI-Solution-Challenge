/** RSS 수집 실행과 외부 수집 결과를 통합 처리합니다. */
const { sourceFeeds } = require("../js/config");
const { db, insertSignals, log } = require("./database");
const { getFeed, MAX_ITEMS_PER_SOURCE, normalizeSignal } = require("./signals");
const { json, now, uid } = require("./utils");
const { asObject, text } = require("./validation");
const { enqueueArticles } = require("./article-worker");
function collectionStatus(details) {
  const healthy = details.filter((source) => source.status === "ok").length;
  return healthy === sourceFeeds.length
    ? "success"
    : healthy > 0
      ? "partial"
      : "failed";
}
function collectionSummary(details, added) {
  const searched = details
    .filter((source) => source.status === "ok")
    .reduce((total, source) => total + source.count, 0);
  const googleNews = details
    .filter((source) => source.status === "ok" && source.id.startsWith("news-"))
    .reduce((total, source) => total + source.count, 0);
  return `${details.filter((source) => source.status === "ok").length}/${sourceFeeds.length}개 피드 확인 · Google News ${googleNews}건 조회 · 전체 ${searched}건 · 신규 ${added}건`;
}
async function refresh(actor) {
  const startedAt = now();
  const lease = await db()
    .prepare(
      "INSERT INTO records (id,kind,data,revision,updated_at) VALUES ('refresh-lock','system','{}',1,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE records.updated_at < ?",
    )
    .bind(startedAt, new Date(Date.now() - 10000).toISOString())
    .run();
  if (!lease.meta.changes)
    return {
      throttled: true,
      message: "10초 이내에 수집이 실행됐습니다. 잠시 후 다시 시도해 주세요.",
    };
  const runId = uid();
  await db()
    .prepare(
      "INSERT INTO refresh_runs (id,started_at,status,added,details) VALUES (?,?,?,?,?)",
    )
    .bind(runId, startedAt, "running", 0, "[]")
    .run();
  const results = await Promise.allSettled(sourceFeeds.map(getFeed));
  const details = [];
  const signals = [];
  results.forEach((result, index) => {
    const feed = sourceFeeds[index];
    if (result.status === "fulfilled") {
      signals.push(...result.value);
      details.push({
        id: feed.id,
        name: feed.name,
        status: "ok",
        count: result.value.length,
      });
    } else
      details.push({
        id: feed.id,
        name: feed.name,
        status: "error",
        error: String(result.reason).slice(0, 160),
      });
  });
  const added = await insertSignals(signals);
  await enqueueArticles(undefined, {
    retryFailed: true,
    signalIds: signals.map((signal) => signal.id),
  });
  const status = collectionStatus(details);
  const finishedAt = now();
  await db().batch([
    db()
      .prepare(
        "UPDATE refresh_runs SET finished_at=?,status=?,added=?,details=? WHERE id=?",
      )
      .bind(finishedAt, status, added, json(details), runId),
    log("수집·분류", runId, collectionSummary(details, added), actor),
  ]);
  const fetched = details
    .filter((source) => source.status === "ok")
    .reduce((total, source) => total + source.count, 0);
  const googleNewsResults = details
    .filter((source) => source.status === "ok" && source.id.startsWith("news-"))
    .reduce((total, source) => total + source.count, 0);
  return {
    runId,
    status,
    added,
    fetched,
    googleNewsResults,
    details,
    finishedAt,
  };
}
async function ingest(body, actor) {
  if (!Array.isArray(body.sources) || body.sources.length > sourceFeeds.length)
    throw new Error("정해진 수집 소스 목록이 필요합니다.");
  const runId = uid();
  const startedAt = now();
  const details = [];
  const signals = [];
  const seenSources = new Set();
  for (const entry of body.sources) {
    const input = asObject(entry);
    const feed = sourceFeeds.find((source) => source.id === input.id);
    if (!feed || seenSources.has(feed.id)) continue;
    seenSources.add(feed.id);
    if (input.status !== "ok") {
      details.push({
        id: feed.id,
        name: feed.name,
        status: "error",
        error: text(input.error, 160) || "수집 실패",
      });
      continue;
    }
    let count = 0;
    for (const raw of (Array.isArray(input.items) ? input.items : []).slice(
      0,
      MAX_ITEMS_PER_SOURCE,
    )) {
      const signal = await normalizeSignal(feed, asObject(raw));
      if (signal) {
        signals.push(signal);
        count++;
      }
    }
    details.push({ id: feed.id, name: feed.name, status: "ok", count });
  }
  for (const feed of sourceFeeds)
    if (!seenSources.has(feed.id))
      details.push({
        id: feed.id,
        name: feed.name,
        status: "error",
        error: "수집 결과 미제출",
      });
  const added = await insertSignals(signals);
  await enqueueArticles(undefined, {
    retryFailed: true,
    signalIds: signals.map((signal) => signal.id),
  });
  const status = collectionStatus(details);
  const finishedAt = now();
  await db().batch([
    db()
      .prepare(
        "INSERT INTO refresh_runs (id,started_at,finished_at,status,added,details) VALUES (?,?,?,?,?,?)",
      )
      .bind(runId, startedAt, finishedAt, status, added, json(details)),
    log("클라우드 수집·분류", runId, collectionSummary(details, added), actor),
  ]);
  return { runId, status, added, details, finishedAt };
}

module.exports = { refresh, ingest };
