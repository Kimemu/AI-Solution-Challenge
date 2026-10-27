/** 영구 대기열: Python 기사 본문 수집 → Codex 요약 → SQLite 저장. */
const { db, log } = require("./database");
const { now } = require("./utils");
const { crawlArticlePython } = require("./python-crawler");
const { contentFor, saveContent, failContent } = require("./article-content");
const { runCodex } = require("./keywords");
let running = false;
let timer;

async function enqueueArticles(id, { retryFailed = false, signalIds } = {}) {
  const rows = id
    ? await db()
        .prepare("SELECT id,data FROM signals WHERE id=?")
        .bind(id)
        .all()
    : await db()
        .prepare(
          "SELECT id,data FROM signals WHERE json_extract(data,'$.kind')='news' AND (json_extract(data,'$.articleAnalysis.summary') IS NULL OR COALESCE(json_extract(data,'$.articleAnalysis.analysisBasis'),'')!='article-body')",
        )
        .all();
  if (id && !rows.results.length) throw new Error("기사를 찾을 수 없습니다.");
  for (const row of rows.results) {
    if (signalIds && !signalIds.includes(row.id)) continue;
    const batch = db()
      .prepare(
        "SELECT j.id FROM research_jobs j JOIN records r ON r.id=json_extract(j.data,'$.sessionId'),json_each(r.data,'$.candidateIds') a WHERE j.kind='analysis' AND j.status IN ('queued','running') AND a.value=? LIMIT 1",
      )
      .bind(row.id)
      .first();
    if (batch) continue;
    await db()
      .prepare(
        id
          ? "INSERT INTO article_jobs (signal_id,status,error,updated_at) VALUES (?,'pending',NULL,?) ON CONFLICT(signal_id) DO UPDATE SET status='pending',error=NULL,updated_at=excluded.updated_at WHERE article_jobs.status NOT IN ('running','pending')"
          : retryFailed
            ? "INSERT INTO article_jobs (signal_id,status,error,updated_at) VALUES (?,'pending',NULL,?) ON CONFLICT(signal_id) DO UPDATE SET status='pending',error=NULL,updated_at=excluded.updated_at WHERE article_jobs.status='failed'"
            : "INSERT OR IGNORE INTO article_jobs (signal_id,status,updated_at) VALUES (?,'pending',?)",
      )
      .bind(row.id, now())
      .run();
  }
  return { queued: true };
}

async function runNext({
  crawler = crawlArticlePython,
  analyzer = (title, text, basis) => runCodex(title, text, true, basis),
} = {}) {
  if (running) return false;
  running = true;
  let job;
  let discardSummary = false;
  try {
    job = await db()
      .prepare(
        "SELECT j.signal_id,s.data FROM article_jobs j JOIN signals s ON s.id=j.signal_id WHERE j.status='pending' ORDER BY j.updated_at DESC LIMIT 1",
      )
      .first();
    if (!job) return false;
    await db()
      .prepare(
        "UPDATE article_jobs SET status='running',updated_at=? WHERE signal_id=?",
      )
      .bind(now(), job.signal_id)
      .run();
    const original = JSON.parse(job.data);
    const article = contentFor(original) || (await crawler(original.url));
    saveContent(job.signal_id, article);
    const result = await analyzer(
      original.title,
      article.fullText,
      "article-body",
    );
    if (result.relevant === false) {
      discardSummary = true;
      throw new Error(
        `제목과 본문이 일치하지 않아 기사를 제외했습니다: ${String(result.rejectionReason || "본문에서 제목의 내용을 확인할 수 없습니다.").slice(0, 300)}`,
      );
    }
    const { validateKeywords } = require("./keywords");
    const keywords = validateKeywords(result);
    if (typeof result.summary !== "string" || result.summary.trim().length < 20)
      throw new Error("AI 요약문이 비어 있습니다.");
    const latest = await db()
      .prepare("SELECT data FROM signals WHERE id=?")
      .bind(job.signal_id)
      .first();
    if (!latest) throw new Error("분석 대상 기사가 없습니다.");
    const signal = JSON.parse(latest.data);
    delete signal.excludedArticleAnalysis;
    signal.feedSummary ??= signal.summary;
    signal.titleKo = result.titleKo || signal.titleKo || signal.title;
    signal.summary = result.summary;
    signal.articleAnalysis = {
      ...article,
      summary: result.summary,
      keywords,
      analysisBasis: "article-body",
      contentHash: signal.articleContent?.contentHash,
      model: "gpt-6-luna",
      effort: "low",
      analyzedAt: now(),
    };
    await db().batch([
      db()
        .prepare("UPDATE signals SET data=? WHERE id=?")
        .bind(JSON.stringify(signal), job.signal_id),
      db()
        .prepare(
          "UPDATE article_jobs SET status='completed',error=NULL,updated_at=? WHERE signal_id=?",
        )
        .bind(now(), job.signal_id),
      log(
        "Python 본문 수집·AI 요약",
        job.signal_id,
        keywords.join(" · "),
        "서버 자동 분석",
      ),
    ]);
    console.log("[ORBITAL article] completed:", job.signal_id);
    return true;
  } catch (error) {
    if (job)
      failContent(job.signal_id, error.message, { discardSummary });
    console.error(
      "[ORBITAL article] failed:",
      job?.signal_id || "queue",
      error.message,
    );
    return false;
  } finally {
    running = false;
  }
}

async function startArticleWorker() {
  if (timer) return;
  const summaries = await db()
    .prepare(
      "SELECT id,data FROM signals WHERE json_extract(data,'$.articleAnalysis.summary') IS NOT NULL",
    )
    .all();
  const refusal =
    /기사 본문이 (없어|제공되지 않)|본문.{0,30}(확인할 수 없|요약하기 어렵|본문에서 확인되지)|구체적(인)? 사실.{0,20}(없|확인)|뉴스레터 안내/i;
  for (const row of summaries.results) {
    const signal = JSON.parse(row.data);
    const analysis = signal.articleAnalysis || {};
    const bodyLength = Math.max(
      signal.articleContent?.fullText?.length || 0,
      analysis.fullText?.length || 0,
    );
    const headlineOnly = analysis.analysisBasis === "google-news-headline";
    const cannotVerify =
      refusal.test(analysis.summary || "") ||
      (bodyLength < 300 &&
        (analysis.analysisBasis === "article-body" || !analysis.analysisBasis));
    if (!headlineOnly && !cannotVerify) continue;
    failContent(
      row.id,
      headlineOnly
        ? "공개 기사 본문을 확인하지 못한 제목 기반 요약이라 제외했습니다."
        : "확보한 본문에서 제목의 기사 내용을 확인할 수 없어 제외했습니다.",
      { discardSummary: true },
    );
  }
  if (process.env.ORBITAL_AI_ENABLED === "0") return;
  await db()
    .prepare("UPDATE article_jobs SET status='pending' WHERE status='running'")
    .run();
  // 수집/기사 클릭으로 등록한 작업만 재개합니다. 탐색 코퍼스 전체를 자동 요약하지 않습니다.
  timer = setInterval(() => void runNext(), 3000);
  timer.unref();
  void runNext();
}
module.exports = { enqueueArticles, runNext, startArticleWorker };
