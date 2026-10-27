import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
const core = require("../js/research-core");
const config = require("../js/research-config");
const {
  translateKeywordLabels, keywordLabelFor, localizeKeywordRecommendations,
} = require("../server/headline-translations");
const { closeDatabase } = require("../server/sqlite");
test.after(closeDatabase);

test("keyword labels default to Korean and permit necessary English abbreviations", () => {
  assert.equal(core.keywordLabel("الطاقة"), "에너지");
  assert.equal(core.keywordLabel("Commercial"), "상업");
  assert.equal(core.keywordLabel("NASA"), "NASA");
  assert.equal(core.keywordLabel("export", "수출"), "수출");
  for (const word of ["цены", "صناعي", "出口", "économique", "export", "EXPORT"])
    assert.equal(core.keywordLabel(word, word), null);
  assert.equal(core.keywordLabel("quantum", "양자 量子"), null);
  assert.equal(core.keywordLabel("energy", "에너지 énergie"), "에너지");
  assert.equal(core.keywordLabel("économique", "경제 économique"), null);
  const article = { kind: "news", title: "الطاقة des pour plus", publishedAt: core.scopeOf().to };
  const recommendation = core.recommend([article], core.scopeOf());
  assert.equal(recommendation.keywords.find((item) => item.word === "에너지").count, 1);
  assert.equal(recommendation.keywords.some((item) => ["الطاقة", "des", "pour", "plus"].includes(item.word)), false);
});

test("validated keyword translations are cached and keep original search terms and counts", async () => {
  let calls = 0;
  const labels = await translateKeywordLabels(["export", "صناعي", "NASA", "에너지"], async (schema, prompt) => {
    calls++;
    assert.equal(schema.properties.translations.minItems, 2);
    assert.ok(prompt.includes("일반 명사"));
    return { translations: [{ id: "0", labelKo: "수출" }, { id: "1", labelKo: "산업" }] };
  });
  assert.equal(labels.get("export"), "수출");
  assert.equal(labels.get("صناعي"), "산업");
  await translateKeywordLabels(["export", "صناعي"], async () => { throw new Error("cache missed"); });
  assert.equal(calls, 1);
  assert.equal(keywordLabelFor("صناعي"), "산업");
  const recommendation = localizeKeywordRecommendations({ total: 10, keywords: [{ word: "صناعي", count: 7 }] });
  assert.deepEqual(recommendation.keywords, [{ word: "صناعي", labelKo: "산업", count: 7 }]);
  const untranslated = localizeKeywordRecommendations({ keywords: [{ word: "未翻訳", labelKo: "未翻訳" }] });
  assert.equal(untranslated.keywords[0].labelKo, null);
});

test("untranslated model output is rejected instead of cached as a display label", async () => {
  await assert.rejects(translateKeywordLabels(["батарея"], async () => ({
    translations: [{ id: "0", labelKo: "батарея" }],
  })), /한국어/);
  assert.equal(keywordLabelFor("батарея"), null);
});

test("browser hides untranslated keywords while selection still searches the original term", async () => {
  const window = { OrbitalResearchCore: core, OrbitalResearchConfig: config };
  vm.runInNewContext(fs.readFileSync(new URL("../js/research-controller.js", import.meta.url), "utf8"), { window });
  let selected;
  const controller = window.OrbitalResearchController.create({
    state: { records: [], signals: [] },
    ui: { connected: true },
    request: async (path, method, body) => { selected = body.keyword; throw new Error("stop after selection"); },
    render() {}, notify() {},
  });
  controller.data.overview = { keywords: [
    { word: "صناعي", labelKo: "산업" },
    { word: "цены", labelKo: "цены" },
    { word: "NASA" },
  ] };
  controller.data.selectedKeyword = "صناعي";
  const model = controller.model();
  assert.deepEqual(Array.from(model.research.keywords, (item) => item.labelKo), ["산업", "NASA"]);
  assert.equal(model.research.selectedKeywordLabel, "산업");
  await model.chooseKeyword("صناعي");
  assert.equal(selected, "صناعي");
});
