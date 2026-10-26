import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_SEED_NEWS = "0";
const {
  crawlArticle,
  extractText,
  publicAddress,
} = require("../server/article");
const { enqueueArticles, runNext } = require("../server/article-worker");
const { db } = require("../server/database");
const { closeDatabase } = require("../server/sqlite");

test("article extraction removes page chrome and supports structured article text", () => {
  const fullText =
    "위성 영상과 선박 위치 정보를 결합하여 해양 안전을 분석하는 서비스에 대한 기사 본문입니다. ".repeat(
      10,
    );
  const html = `<nav><p>광고 메뉴 ${"navigation".repeat(100)}</p></nav><article><h1>위성 관측 서비스</h1><p>${fullText}</p></article><script>malicious()</script>`;
  const extracted = extractText(html);
  assert.ok(extracted.includes(fullText.trim()));
  assert.ok(!extracted.includes("navigation"));
  assert.equal(
    extractText(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", articleBody: fullText })}</script>`,
    ),
    fullText.trim(),
  );
  assert.throws(() => extractText("<p>로그인해 주세요.</p>"), /본문/);
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.26.28.211",
    "169.254.1.1",
    "192.168.1.1",
    "::1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("192.0.66.108"), true);
});

test("Google wrapper is resolved before publisher text is passed to AI", async () => {
  const text = "위성 관측 원문 본문과 핵심 기술에 대한 설명입니다. ".repeat(20);
  const urls = [];
  const result = await crawlArticle(
    "https://news.google.com/rss/articles/encoded",
    async (url, options) => {
      urls.push(url);
      if (url.includes("batchexecute")) {
        assert.ok(options.body.includes("f.req="));
        return {
          text: JSON.stringify([
            [
              "wrb.fr",
              "Fbv4je",
              JSON.stringify(["garturlres", "https://publisher.example/story"]),
            ],
          ]),
        };
      }
      if (url.includes("news.google"))
        return {
          url,
          text: '<div data-n-a-sg="signature" data-n-a-ts="123">',
          type: "text/html",
        };
      return {
        url,
        text: `<article><p>${text}</p></article>`,
        type: "text/html",
      };
    },
  );
  assert.equal(result.resolvedUrl, "https://publisher.example/story");
  assert.ok(result.fullText.includes(text.trim()));
  assert.equal(urls.length, 3);
});

test("automatic queue persists summaries, deduplicates and records crawl failures without inventing summaries", async (t) => {
  t.after(closeDatabase);
  const article = {
    id: "test-news",
    kind: "news",
    title: "위성 사업 기사",
    url: "https://publisher.example/story",
    summary: "원래 RSS 설명",
  };
  await db()
    .prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
    .bind(
      article.id,
      article.url,
      JSON.stringify(article),
      new Date().toISOString(),
    )
    .run();
  await enqueueArticles();
  await enqueueArticles();
  assert.equal(
    (await db().prepare("SELECT count(*) AS count FROM article_jobs").first())
      .count,
    1,
  );
  let calls = 0;
  await runNext({
    crawler: async () => {
      throw new Error("HTTP 403");
    },
    analyzer: async () => {
      calls++;
    },
  });
  assert.equal(calls, 0);
  assert.equal(
    (await db().prepare("SELECT status FROM article_jobs").first()).status,
    "failed",
  );
  assert.equal(
    JSON.parse((await db().prepare("SELECT data FROM signals").first()).data)
      .summary,
    "원래 RSS 설명",
  );
  await enqueueArticles();
  assert.equal(
    (await db().prepare("SELECT status FROM article_jobs").first()).status,
    "failed",
  );
  await enqueueArticles(undefined, { retryFailed: true });
  assert.equal(
    (await db().prepare("SELECT status FROM article_jobs").first()).status,
    "pending",
  );
  await enqueueArticles(article.id);
  const fullText =
    "본문 전체를 자르지 않고 AI에 전달하는 검증용 기사입니다. ".repeat(400);
  const summary =
    "위성 영상과 AIS를 결합한 서비스가 개발됐다. 해양 안전 관리를 지원하며 현재 검증 중이다.";
  await runNext({
    crawler: async () => ({ fullText, resolvedUrl: article.url }),
    analyzer: async (title, text) => {
      assert.equal(text, fullText);
      return { summary, keywords: ["위성 영상", "AIS", "해양 안전"] };
    },
  });
  const saved = JSON.parse(
    (await db().prepare("SELECT data FROM signals").first()).data,
  );
  assert.equal(saved.summary, summary);
  assert.equal(saved.feedSummary, "원래 RSS 설명");
  assert.equal(saved.articleAnalysis.fullText, fullText);
  assert.equal(saved.articleAnalysis.keywords.length, 3);
  const googleNews = {
    ...article,
    id: "test-google-news",
    url: "https://news.google.com/rss/articles/test",
    title: "위성 사업 발표 - Google News 출처",
    source: "테스트 매체",
  };
  await db()
    .prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
    .bind(
      googleNews.id,
      googleNews.url,
      JSON.stringify(googleNews),
      new Date().toISOString(),
    )
    .run();
  await enqueueArticles(googleNews.id);
  const headlineSummary =
    "Google News 원문 주소에서 수집한 기사 본문 전체를 기반으로 작성한 한국어 요약입니다.";
  await runNext({
    crawler: async (url) => {
      assert.equal(url, googleNews.url);
      return {
        fullText,
        resolvedUrl: "https://publisher.example/article",
        extractionMethod: "python-trafilatura",
      };
    },
    analyzer: async (title, text, basis) => {
      assert.equal(title, googleNews.title);
      assert.equal(basis, "article-body");
      assert.equal(text, fullText);
      return {
        summary: headlineSummary,
        keywords: ["위성", "사업 발표", "테스트 매체"],
      };
    },
  });
  const googleSaved = JSON.parse(
    (
      await db()
        .prepare("SELECT data FROM signals WHERE id=?")
        .bind(googleNews.id)
        .first()
    ).data,
  );
  assert.equal(googleSaved.articleAnalysis.analysisBasis, "article-body");
  assert.equal(googleSaved.summary, headlineSummary);
  assert.equal(await runNext(), false);
});
