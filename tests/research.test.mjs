import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_SEED_NEWS = "0";
process.env.ORBITAL_AI_ENABLED = "0";
const core = require("../js/research-core");
const config = require("../js/research-config");
const { feedsFor } = require("../server/research-sources");
const { budgetOf } = require("../server/research-logic");
const { db, insertSignals } = require("../server/database");
const research = require("../server/research");
const { updateRecord } = require("../server/records");
const { reportData, printHtml } = require("../server/reports");
const { closeDatabase } = require("../server/sqlite");

test("period and continent filters use article geography, keyword document frequency, and explicit publisher provenance", () => {
  const scope = core.scopeOf({ range: "30", continent: "oceania" });
  const today = scope.to + "T01:00:00.000Z";
  const article = {
    id: "a",
    kind: "news",
    title: "Satellite satellite satellite solar forecast",
    publisherDomain: "abc.net.au",
    publishedAt: today,
  };
  assert.equal(core.enrich(article).countryBasis, "publisher-location");
  assert.deepEqual(core.enrich(article).countryCodes, ["AU"]);
  assert.equal(core.inScope(article, scope), true);
  assert.equal(
    core.inScope({ ...article, publishedAt: "2000-01-01" }, scope),
    false,
  );
  assert.equal(
    core.inScope({ ...article, publisherDomain: "nhk.or.jp" }, scope),
    false,
  );
  const frequency = core.recommend([article], scope);
  assert.equal(
    frequency.keywords.find((word) => word.word === "위성").count,
    1,
  );
  assert.equal(core.includesTerm("India invests in AI", "AI"), true);
  assert.equal(core.includesTerm("rainfall", "AI"), false);
  const publisherTitle = {
    ...article,
    title:
      "Satellite report - ABC News & Headlines – Australian Broadcasting Corporation",
    source: "ABC News & Headlines – Australian Broadcasting Corporation",
    url: "https://news.google.com/rss/articles/test",
  };
  assert.equal(core.headline(publisherTitle), "Satellite report");
  assert.equal(core.enrich(publisherTitle).countryBasis, "publisher-location");
  assert.ok(
    !core
      .recommend([publisherTitle], scope)
      .keywords.some((word) =>
        /Headlines|Corporation|Broadcasting/.test(word.word),
      ),
  );
  const dayScope = core.scopeOf({
    range: "custom",
    from: scope.to,
    to: scope.to,
    continent: "oceania",
  });
  assert.equal(
    core.inScope(
      {
        ...article,
        publishedAt: new Date(scope.to + "T00:00:00+09:00").toISOString(),
      },
      dayScope,
    ),
    true,
  );
  assert.throws(() =>
    core.scopeOf({ range: "custom", from: "2026-02-30", to: scope.to }),
  );
  assert.equal(config.countries.length, 52);
  for (const country of config.countries)
    assert.equal(country.outlets.length, 5);
  const feeds = feedsFor(scope);
  assert.equal(
    feeds.filter((feed) => feed.id.startsWith("country-")).length,
    2,
  );
  for (const feed of feeds.filter((feed) => feed.outlets)) {
    const query = new URL(feed.url).searchParams.get("q");
    for (const outlet of feed.outlets)
      assert.ok(query.includes("site:" + outlet.domain));
    assert.ok(query.includes("after:" + scope.from));
  }
  assert.deepEqual(
    [59, 60, 75, 85].map((score) => core.stageFor(score)),
    ["watch", "diligence", "pilot", "approved"],
  );
});

test("missing publisher bodies are excluded from ideas and budget, and retry restores them without new records", async (t) => {
  t.after(closeDatabase);
  const scope = core.scopeOf({ range: "30", continent: "oceania" });
  const article = {
    id: "body-required",
    url: "https://news.google.com/rss/articles/body-required",
    title: "Australia satellite observation",
    kind: "news",
    category: "space",
    source: "ABC",
    publisherDomain: "abc.net.au",
    publishedAt: scope.to + "T01:00:00Z",
    collectedAt: scope.to + "T01:00:00Z",
    summary: "제목만 있는 RSS 정보",
  };
  await insertSignals([article]);
  let aiCalls = 0;
  const failed = await research.startAnalysis(
    { keyword: "위성", scope },
    {
      crawler: async (items, progress) => {
        for (const item of items)
          progress({
            id: item.id,
            ok: false,
            code: "access-blocked",
            error: "HTTP 403",
          });
      },
      analyzer: async () => {
        aiCalls++;
        throw new Error("본문 없는 기사는 AI로 전달하면 안 됩니다.");
      },
    },
  );
  await research.running.get(failed.id);
  assert.equal(aiCalls, 0);
  assert.equal(research.resultsFor(failed.data.sessionId).articles.length, 0);
  let report = reportData(failed.data.sessionId + "-report");
  assert.equal(report.ideas.length, 0);
  assert.equal(report.report.budgetStatus, "pending");
  assert.equal(report.report.budget.total, 0);
  const reportId = report.report.id;
  const fullText =
    "공개된 기사 본문 전체입니다. 위성 관측 자료를 활용하는 방법과 실제 검증 조건, 고객에게 제공할 수 있는 분석 항목을 설명합니다. ".repeat(
      120,
    );
  await research.retryJob(failed.id, {
    crawler: async (items, progress) => {
      for (const item of items)
        progress({
          id: item.id,
          ok: true,
          fullText,
          resolvedUrl: "https://public.example/news",
          extractionMethod: "python-trafilatura",
          pipelineVersion: 1,
        });
    },
    analyzer: async (batch) => {
      for (const item of batch)
        assert.equal(item.articleContent.fullText, fullText);
      return {
        articles: batch.map((item) => ({
          id: item.id,
          summary:
            "원문 전체를 읽고 검증 조건과 위성 관측 사업 내용을 한국어로 요약한 결과입니다.",
          keywords: ["위성 관측", "검증 조건", "분석 서비스"],
        })),
        ideas: [],
      };
    },
  });
  await research.running.get(failed.id);
  assert.equal(research.jobById(failed.id).status, "completed");
  assert.equal(research.resultsFor(failed.data.sessionId).articles.length, 1);
  report = reportData(reportId);
  assert.equal(report.report.id, reportId);
  assert.equal(report.ideas.length, 1);
  assert.ok(report.report.budget.total > 0);
});

test("keyword click persists every draft, protects user edits during AI, caches reruns and prints the edited budget and evidence", async (t) => {
  t.after(closeDatabase);
  const scope = core.scopeOf({ range: "30", continent: "oceania" });
  const date = scope.to + "T01:00:00.000Z";
  const articles = [
    {
      id: "research-a",
      title: "Australia satellite launch contract",
      category: "space",
      publisherDomain: "abc.net.au",
    },
    {
      id: "research-b",
      title: "New Zealand satellite solar forecast",
      category: "solar",
      publisherDomain: "rnz.co.nz",
    },
    {
      id: "research-c",
      title: "Australia satellite solar power investment",
      category: "solar",
      publisherDomain: "sbs.com.au",
    },
  ].map((article) => ({
    ...article,
    url: "https://news.google.com/rss/articles/" + article.id,
    source: article.publisherDomain,
    kind: "news",
    collectedAt: date,
    publishedAt: date,
    entities: [],
    summary: "Google News RSS 정보",
    articleContent: {
      fullText:
        "공개 기사 본문 전체를 검증하기 위한 충분한 내용입니다. 위성 관측과 서비스 개발, 에너지 기술과 시장 동향을 설명합니다. ".repeat(
          100,
        ),
      resolvedUrl: "https://example.test/full-article",
      extractionMethod: "test-fixture",
      pipelineVersion: 1,
    },
  }));
  const discovery = await research.startDiscovery(
    { scope },
    { fetcher: async () => articles },
  );
  await research.running.get(discovery.id);
  assert.equal(research.jobById(discovery.id).status, "completed");
  assert.equal(research.jobById(discovery.id).data.total, 3);
  await insertSignals([
    {
      ...articles[0],
      id: "blocked",
      url: "https://example.test/blocked",
      title: "Australia satellite blocked article",
    },
  ]);
  db()
    .prepare("INSERT INTO article_jobs VALUES (?,'failed',?,?)")
    .bind("blocked", "HTTP 403", date)
    .run();
  assert.equal(research.getOverview(scope).total, 3);
  let completeAI;
  const deferred = new Promise((resolve) => {
    completeAI = resolve;
  });
  const analysis = await research.startAnalysis(
    { keyword: "위성", scope, discoveryId: discovery.id },
    {
      analyzer: async (batch, drafts) => {
        await deferred;
        return {
          articles: batch.map((article) => ({
            id: article.id,
            summary:
              "위성 관련 사업 동향을 전하는 제목 기반 한국어 요약입니다. 본문의 세부 사실은 확인 전입니다.",
            keywords: ["위성", "사업 동향", "시장 신호"],
          })),
          ideas: drafts.map((draft) => ({
            ...draft,
            title: "AI가 구체화한 " + draft.title,
          })),
        };
      },
    },
  );
  const sessionId = analysis.data.sessionId;
  await new Promise((resolve) => setImmediate(resolve));
  const initial = research.resultsFor(sessionId);
  assert.equal(initial.articles.length, 3);
  let records = db()
    .prepare("SELECT * FROM records WHERE json_extract(data,'$.researchId')=?")
    .bind(sessionId)
    .all().results;
  const ideas = records.filter((record) => record.kind === "opportunity");
  assert.equal(ideas.length, 2);
  assert.equal(
    records.filter((record) => record.kind === "decision").length,
    2,
  );
  assert.equal(
    records.filter((record) => record.kind === "assumption").length,
    6,
  );
  assert.equal(records.filter((record) => record.kind === "report").length, 1);
  assert.ok(
    records
      .filter((record) => record.kind === "assumption")
      .every((record) => JSON.parse(record.data).actual === null),
  );
  const edited = await updateRecord(
    ideas[0].id,
    {
      revision: ideas[0].revision,
      data: {
        title: "사용자가 수정한 안건",
        scores: { fit: 5, demand: 5, economics: 5, moat: 5 },
      },
    },
    "검증 사용자",
  );
  assert.equal(edited.stage, "approved");
  completeAI();
  await research.running.get(analysis.id);
  assert.equal(research.jobById(analysis.id).status, "completed");
  assert.equal(
    JSON.parse(
      db()
        .prepare("SELECT data FROM records WHERE id=?")
        .bind(ideas[0].id)
        .first().data,
    ).title,
    "사용자가 수정한 안건",
  );
  assert.ok(
    research
      .resultsFor(sessionId)
      .articles.every((article) =>
        /한국어/.test(article.articleAnalysis.summary),
      ),
  );
  const cached = await research.startAnalysis({ keyword: "위성", scope });
  assert.equal(cached.id, analysis.id);
  assert.equal(cached.cached, true);
  let repeatedSummaryCount = -1;
  const nextKeyword = await research.startAnalysis(
    { keyword: "태양광", scope },
    {
      analyzer: async (batch) => {
        repeatedSummaryCount = Math.max(repeatedSummaryCount, batch.length);
        return { articles: [], ideas: [] };
      },
    },
  );
  await research.running.get(nextKeyword.id);
  assert.equal(
    repeatedSummaryCount,
    0,
    "새 키워드에서도 저장된 요약은 재사용합니다.",
  );
  await insertSignals([
    {
      ...articles[0],
      id: "retry-summary",
      url: "https://news.google.com/rss/articles/retry-summary",
      title: "Australia satellite methane monitoring",
    },
  ]);
  const partial = await research.startAnalysis(
    { keyword: "위성", scope, force: true },
    { analyzer: async () => ({ articles: [], ideas: [] }) },
  );
  await research.running.get(partial.id);
  assert.equal(research.jobById(partial.id).status, "partial");
  assert.ok(
    !research
      .resultsFor(partial.data.sessionId)
      .articles.some((article) => article.id === "retry-summary"),
  );
  await research.retryJob(partial.id, {
    analyzer: async (batch) => ({
      articles: batch.map((article) => ({
        id: article.id,
        summary:
          "재시도 결과 정상적으로 저장한 한국어 제목 기반 요약입니다. 본문은 확인 전입니다.",
        keywords: ["위성", "메탄", "관측"],
      })),
      ideas: [],
    }),
  });
  await research.running.get(partial.id);
  assert.equal(research.jobById(partial.id).status, "completed");
  assert.ok(
    research
      .resultsFor(partial.data.sessionId)
      .articles.some((article) => article.id === "retry-summary"),
  );
  const bundle = reportData(sessionId + "-report");
  const report = bundle.report;
  const editedBudget = budgetOf({
    items: [
      {
        label: "사용자 산정 인건비",
        quantity: 2,
        unit: "인일",
        unitCost: 300000,
      },
    ],
    reservePercent: 10,
  });
  const updatedReport = await updateRecord(
    report.id,
    {
      revision: report.revision,
      data: {
        title: "검토 보고안 <script>태그</script>",
        budget: editedBudget,
      },
    },
    "검증 사용자",
  );
  assert.equal(updatedReport.budget.total, 660000);
  const output = printHtml(report.id);
  assert.ok(output.includes("660,000원"));
  assert.ok(output.includes("&lt;script&gt;태그&lt;/script&gt;"));
  assert.ok(!output.includes("<script>태그</script>"));
  assert.ok(output.includes('href="https://example.test/full-article"'));
  await assert.rejects(
    updateRecord(
      report.id,
      { revision: report.revision, data: { title: "낡은 버전" } },
      "검증 사용자",
    ),
    /CONFLICT/,
  );
});
