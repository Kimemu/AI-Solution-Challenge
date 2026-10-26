/** 기사 본문 캐시. 제목 요약과 실제 본문 요약을 구분합니다. */
const { createHash } = require("node:crypto");
const { db } = require("./database");
const { headline, enrich } = require("../js/research-core");
const { now, json } = require("./utils");
function contentFor(signal) {
  const content = signal.articleContent;
  if (content?.sourceTitle && content.sourceTitle !== headline(signal))
    return null;
  if (
    content?.pipelineVersion === 1 &&
    content.fullText?.length >= 300 &&
    (!content.sourceTitle || content.sourceTitle === headline(signal))
  )
    return content;
  const analysis = signal.articleAnalysis;
  if (
    analysis?.analysisBasis === "article-body" &&
    analysis.fullText?.length >= 300
  )
    return {
      fullText: analysis.fullText,
      resolvedUrl: analysis.resolvedUrl || signal.url,
      fetchedAt: analysis.fetchedAt || analysis.analyzedAt,
      extractionMethod: analysis.extractionMethod || "stored-article-body",
      pipelineVersion: 1,
    };
  return null;
}
function saveContent(id, result) {
  const row = db()
    .prepare("SELECT data FROM signals WHERE id=?")
    .bind(id)
    .first();
  if (!row) throw new Error("본문을 저장할 기사가 없습니다.");
  const signal = JSON.parse(row.data);
  const fullText = result.fullText;
  if (
    typeof fullText !== "string" ||
    fullText.length < 300 ||
    fullText.length > 100000
  )
    throw new Error("실제 기사 본문은 300~100,000자가 필요합니다.");
  const contentHash = createHash("sha256").update(fullText).digest("hex");
  const { id: unusedId, ok, ...data } = result;
  signal.articleContent = {
    ...data,
    fullText,
    contentHash,
    pipelineVersion: 1,
    sourceTitle: headline(signal),
    fetchedAt: result.fetchedAt || now(),
  };
  const existing = signal.articleAnalysis;
  const reusable =
    existing?.analysisBasis === "article-body" &&
    (existing.contentHash === contentHash || existing.fullText === fullText);
  if (reusable) signal.articleAnalysis = { ...existing, contentHash };
  else if (existing) {
    signal.previousArticleAnalysis = existing;
    delete signal.articleAnalysis;
  }
  if (!reusable) {
    signal.feedSummary ??= signal.summary;
    signal.summary = "기사 본문 확보 · 한국어 요약 준비 중";
  }
  const updated = enrich({ ...signal, countryVersion: 0 });
  db().batch([
    db()
      .prepare("UPDATE signals SET data=? WHERE id=?")
      .bind(json(updated), id),
    db()
      .prepare(
        "INSERT INTO article_jobs (signal_id,status,error,updated_at) VALUES (?,?,NULL,?) ON CONFLICT(signal_id) DO UPDATE SET status=excluded.status,error=NULL,updated_at=excluded.updated_at",
      )
      .bind(id, reusable ? "completed" : "body-ready", now()),
  ]);
  return updated.articleContent;
}
function failContent(id, error) {
  db()
    .prepare(
      "INSERT INTO article_jobs (signal_id,status,error,updated_at) VALUES (?,'failed',?,?) ON CONFLICT(signal_id) DO UPDATE SET status='failed',error=excluded.error,updated_at=excluded.updated_at",
    )
    .bind(
      id,
      String(error || "공개 기사 본문을 확보하지 못했습니다.").slice(0, 400),
      now(),
    )
    .run();
}
module.exports = { contentFor, saveContent, failContent };
