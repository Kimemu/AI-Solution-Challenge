import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_AI_ENABLED = "0";
const core = require("../js/research-core");
const config = require("../js/config");
const researchConfig = require("../js/research-config");
const { db } = require("../server/database");
const { getState } = require("../server/state");
const { handleApi } = require("../server/api");
const { reportData } = require("../server/reports");
const { closeDatabase } = require("../server/sqlite");
test.after(closeDatabase);

const visible = {
  id: "visible",
  kind: "news",
  title: "확인된 기사",
  category: "solar",
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  countryVersion: 2,
  countryCodes: ["KR"],
};

test("failed and unverified summaries never become visible articles", () => {
  assert.equal(core.isArticleVisible(visible), true);
  for (const fields of [
    { articleJob: { status: "failed" } },
    { articleExclusion: { reason: "본문 불일치" } },
    { articleAnalysis: { relevant: false } },
    { articleAnalysis: { analysisBasis: "google-news-headline" } },
    { articleAnalysis: { summary: "제공된 본문에는 뉴스레터 안내와 ABS-CBN의 회사 소개만 담겨 있어, 제목의 내용은 확인할 수 없습니다." } },
  ])
    assert.equal(core.isArticleVisible({ ...visible, ...fields }), false);
});

test("browser counts, cached articles and globe countries exclude rejected IDs", async () => {
  const stale = { ...visible, id: "stale", countryCodes: ["US"] };
  const failed = { ...visible, id: "failed", articleJob: { status: "failed" } };
  const window = {
    OrbitalResearchCore: core,
    OrbitalConfig: config,
    OrbitalResearchConfig: researchConfig,
  };
  for (const file of ["selectors", "research-controller"])
    vm.runInNewContext(
      fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"),
      { window },
    );
  const selected = window.OrbitalSelect(
    { signals: [visible, failed], records: [], runs: [] },
    "all", "", "all",
  );
  assert.equal(selected.news.length, 1);
  assert.equal(selected.counts.solar, 1);
  const ui = { sector: "all", query: "", modal: null };
  const requests = [];
  const controller = window.OrbitalResearchController.create({
    state: {
      records: [{ id: "session", kind: "research" }],
      signals: [visible], excludedSignalIds: ["stale"],
    },
    ui,
    request: async (path, method = "GET") => {
      requests.push({ path, method });
      return failed;
    },
    render() {}, notify() {}, async load() {},
    setModal(modal) { ui.modal = modal; },
  });
  controller.data.activeId = "session";
  controller.data.result = { articles: [visible, stale, failed] };
  const model = controller.model();
  assert.equal(model.researchArticles.length, 1);
  assert.equal(model.relatedCountries.length, 1);
  assert.equal(model.relatedCountries[0].code, "KR");
  await model.openArticle(failed);
  assert.equal(requests.length, 0);
  await model.openArticle(stale);
  assert.equal(ui.modal, null);
  assert.equal(requests.length, 0);
  await model.openArticle({ ...visible, id: "rejected-by-server" });
  assert.equal(ui.modal, null);
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("excluded article data is absent from website APIs and report evidence", async () => {
  for (const signal of [
    { ...visible, lastSeenAt: visible.collectedAt, url: "https://example.test/visible" },
    { ...visible, id: "hidden", lastSeenAt: visible.collectedAt, url: "https://example.test/hidden", articleExclusion: { reason: "본문 불일치" }, summary: "표시하면 안 되는 요약" },
  ])
    db().prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
      .bind(signal.id, signal.url, JSON.stringify(signal), signal.collectedAt).run();
  const state = await getState();
  assert.equal(state.signals.some((signal) => signal.id === "hidden"), false);
  assert.ok(state.excludedSignalIds.includes("hidden"));
  const response = await handleApi(new Request("http://localhost/api/signals/hidden"), "signals/hidden");
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes("표시하면 안 되는 요약"));
  for (const record of [
    { id: "session", kind: "research" },
    { id: "report", kind: "report", researchId: "session" },
    { id: "idea", kind: "opportunity", researchId: "session", evidenceIds: ["visible", "hidden"], score: 50 },
  ])
    db().prepare("INSERT INTO records (id,kind,data,updated_at) VALUES (?,?,?,?)")
      .bind(record.id, record.kind, JSON.stringify(record), visible.collectedAt).run();
  assert.deepEqual(reportData("report").evidence.map((article) => article.id), ["visible"]);
});
