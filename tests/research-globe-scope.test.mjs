import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../js/research-core");
const config = require("../js/research-config");
const scope = core.scopeOf({ range: "7", continent: "africa" });
const article = (id, title, code, fields = {}) => ({
  id, title, kind: "news", category: "space", countryVersion: 2,
  countryCodes: [code], publishedAt: scope.to, lastSeenAt: scope.to, ...fields,
});
const signals = [
  article("solar", "South African solar energy", "ZA", { category: "solar" }),
  article("shipping", "Kenyan maritime shipping", "KE", { category: "maritime" }),
  article("space", "Nigerian satellite launch", "NG"),
  article("asia", "Japan solar energy", "JP"),
  article("old", "Egypt solar energy", "EG", { publishedAt: "2000-01-01" }),
  article("failed", "Moroccan solar energy", "MA", { articleJob: { status: "failed" } }),
  article("blocked", "Egypt satellite launch", "EG"),
  article("reference", "South African solar energy", "ZA", { kind: "reference" }),
];

function controllerForTest() {
  const requests = [];
  const state = { signals, records: [{ id: "session", kind: "research", articleIds: ["solar"] }], excludedSignalIds: ["blocked"] };
  const ui = { connected: true, sector: "all", query: "", selectedCountry: null };
  const window = { OrbitalResearchCore: core, OrbitalResearchConfig: config };
  vm.runInNewContext(fs.readFileSync(new URL("../js/research-controller.js", import.meta.url), "utf8"), { window, setTimeout, clearTimeout });
  const controller = window.OrbitalResearchController.create({
    state, ui, render() {}, notify() {}, async load() {},
    request: async (path) => {
      requests.push(path);
      return { id: "discovery", status: "completed", data: { keywords: [] } };
    },
  });
  controller.data.scope = scope;
  return { controller, ui, requests };
}

test("unselected keywords show countries across all topics within the search scope", () => {
  const { controller, ui } = controllerForTest();
  const model = controller.model();
  assert.equal(model.currentSession, undefined);
  assert.deepEqual(Array.from(model.researchArticles, (item) => item.id), ["solar", "shipping", "space"]);
  assert.deepEqual(Array.from(model.globeLocations, (item) => item.code).sort(), ["KE", "NG", "ZA"]);
  assert.equal(model.globeLocations.reduce((sum, item) => sum + item.count, 0), 3);
  ui.selectedCountry = "Kenya";
  const selectedCountry = controller.model();
  assert.deepEqual(Array.from(selectedCountry.researchArticles, (item) => item.id), ["shipping"]);
  assert.equal(selectedCountry.relatedCountries.length, 3);
  controller.data.scope = { ...scope, continent: "asia" };
  ui.selectedCountry = null;
  assert.deepEqual(Array.from(controller.model().globeLocations, (item) => item.code), ["JP"]);
});

test("selecting a keyword switches the globe to its analysis articles", () => {
  const { controller } = controllerForTest();
  controller.data.activeId = "session";
  controller.data.selectedKeyword = "태양광";
  controller.data.result = { articles: [signals[0]] };
  assert.deepEqual(Array.from(controller.model().globeLocations, (item) => item.code), ["ZA"]);
});

test("a new news search clears keyword and country filters and restores the entire scope", async () => {
  const { controller, ui, requests } = controllerForTest();
  controller.data.activeId = "session";
  controller.data.selectedKeyword = "태양광";
  controller.data.result = { articles: [signals[0]] };
  ui.selectedCountry = "South Africa";
  ui.sector = "solar";
  ui.query = "solar";
  await controller.model().discoverKeywords();
  assert.equal(controller.data.activeId, null);
  assert.equal(controller.data.selectedKeyword, "");
  assert.equal(controller.data.result, null);
  assert.equal(ui.selectedCountry, null);
  assert.equal(controller.model().globeLocations.length, 3);
  assert.deepEqual(requests, ["research/discover"]);
});
