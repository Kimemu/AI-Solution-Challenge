/** API 경로를 업무 함수에 연결합니다. */
const { ingest, refresh } = require("./collection");
const {
  actual,
  createRecord,
  decision,
  schedule,
  updateRecord,
  verify,
} = require("./records");
const { MAX_ITEMS_PER_SOURCE } = require("./signals");
const { getState } = require("./state");
const { asObject } = require("./validation");
const { sourceFeeds } = require("../js/config");
const { startKeywords, keywordJob } = require("./keywords");
const { enqueueArticles } = require("./article-worker");
const research = require("./research");
const { reportData, printHtml, generatePdf } = require("./reports");
const mutations = {
  ingest,
  records: createRecord,
  decisions: decision,
  actuals: actual,
  verify,
  schedule,
};
async function handleApi(request, path) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        return Response.json(
          { error: "동일 사이트에서 실행해 주세요." },
          { status: 403 },
        );
    }
    const actor = "워크스페이스 사용자";
    if (request.method === "GET" && path.startsWith("research/jobs/"))
      return Response.json(
        research.jobById(path.slice("research/jobs/".length)),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (request.method === "GET" && path.startsWith("research/results/"))
      return Response.json(
        research.resultsFor(path.slice("research/results/".length)),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (request.method === "GET" && path === "research/overview")
      return Response.json(research.getOverview(), {
        headers: { "Cache-Control": "no-store" },
      });
    const reportMatch = path.match(/^reports\/([\w-]+)(?:\/(html|pdf))?$/);
    if (request.method === "GET" && reportMatch) {
      const [, id, format] = reportMatch;
      if (format === "html")
        return new Response(printHtml(id), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      if (format === "pdf") {
        reportData(id);
        const port = Number(
          new URL(request.url).port || process.env.PORT || 37214,
        );
        return new Response(await generatePdf(id, port), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="orbital-business-proposal.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return Response.json(reportData(id), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method === "GET" && path.startsWith("signals/")) {
      const { db } = require("./database");
      const row = db()
        .prepare("SELECT data FROM signals WHERE id=?")
        .bind(path.slice(8))
        .first();
      if (!row) throw new Error("기사를 찾을 수 없습니다.");
      const job = db()
        .prepare("SELECT status,error FROM article_jobs WHERE signal_id=?")
        .bind(path.slice(8))
        .first();
      return Response.json(
        { ...JSON.parse(row.data), articleJob: job || null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (request.method === "GET" && path.startsWith("keywords/jobs/"))
      return Response.json(keywordJob(path.slice("keywords/jobs/".length)), {
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method === "GET" && path === "update-manifest")
      return Response.json({
        revision: "orbital-updater-v1",
        sources: sourceFeeds,
        writer: "/api/ingest",
        maxItemsPerSource: MAX_ITEMS_PER_SOURCE,
      });
    if (request.method === "GET" && path === "state")
      return Response.json(await getState(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method === "POST" && path === "refresh")
      return Response.json(await refresh(actor));
    const raw = await request.text();
    if (
      raw.length >
      (path === "keywords"
        ? 500000
        : path === "ingest" || path.startsWith("records/")
          ? 200000
          : 20000)
    )
      return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const body = asObject(JSON.parse(raw || "{}"));
    if (request.method === "POST" && path === "research/discover")
      return Response.json(await research.startDiscovery(body), {
        status: 202,
      });
    if (request.method === "POST" && path === "research/analyze")
      return Response.json(await research.startAnalysis(body), { status: 202 });
    if (request.method === "POST" && path === "research/recommendations")
      return Response.json(research.getOverview(body.scope));
    if (request.method === "POST" && path === "research/retry")
      return Response.json(await research.retryJob(body.id), { status: 202 });
    if (request.method === "POST" && path === "research/settings")
      return Response.json(await research.saveSettings(body));
    if (request.method === "POST" && path === "article-analysis") {
      if (typeof body.id !== "string") throw new Error("기사 ID가 필요합니다.");
      return Response.json(await enqueueArticles(body.id), { status: 202 });
    }
    if (request.method === "POST" && path === "keywords")
      return Response.json(await startKeywords(body, actor), { status: 202 });
    if (request.method === "PATCH" && path.startsWith("records/"))
      return Response.json(await updateRecord(path.slice(8), body, actor));
    if (request.method === "POST" && Object.hasOwn(mutations, path))
      return Response.json(await mutations[path](body, actor));
    return Response.json(
      { error: "경로를 찾을 수 없습니다." },
      { status: 404 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "처리에 실패했습니다.";
    return Response.json(
      { error: message.replace(/^CONFLICT:/, "") },
      { status: message.startsWith("CONFLICT:") ? 409 : 400 },
    );
  }
}

module.exports = { handleApi };
