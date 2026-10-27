import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_AI_ENABLED = "0";
const core = require("../js/research-core");
const { db, insertSignals } = require("../server/database");
const { getOverview } = require("../server/research");
const { handleApi } = require("../server/api");
const { closeDatabase } = require("../server/sqlite");
test.after(closeDatabase);

const scope = core.scopeOf({ range: "7", continent: "africa" });
const article = {
  id: "african-legacy",
  url: "https://example.test/african-legacy",
  title: "Satellite solar forecasting service",
  source: "News24",
  publisherDomain: "news24.com",
  kind: "news",
  category: "solar",
  countryVersion: 2,
  publishedAt: scope.to + "T00:00:00+09:00",
  collectedAt: scope.to + "T00:00:00+09:00",
  lastSeenAt: scope.to + "T00:00:00+09:00",
};

test("incomplete cached geography is reclassified before continent filtering", () => {
  for (const countryCodes of [undefined, null, "ZA", [null]]) {
    const incomplete = { ...article, countryCodes };
    assert.deepEqual(core.enrich(incomplete).countryCodes, ["ZA"]);
    assert.equal(core.inScope(incomplete, scope), true);
    assert.equal(core.inScope(incomplete, { ...scope, continent: "asia" }), false);
    assert.equal(core.recommend([incomplete], scope).total, 1);
    assert.equal(core.countryCounts([incomplete])[0].code, "ZA");
  }
  const unknown = { ...article, publisherDomain: "example.test" };
  assert.deepEqual(core.enrich(unknown).countryCodes, []);
  assert.equal(core.inScope(unknown, scope), false);
});

test("refresh persists empty geography and replaces stale country assignments", async () => {
  const stored = { ...article, id: "refresh", url: "https://example.test/refresh", publisherDomain: "example.test" };
  db().prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
    .bind(stored.id, stored.url, JSON.stringify(stored), stored.collectedAt).run();
  const incoming = { ...stored, countryCodes: [], countryBasis: "unknown" };
  const saved = () => JSON.parse(db().prepare("SELECT data FROM signals WHERE id=?").bind(stored.id).first().data);
  await insertSignals([incoming]);
  assert.deepEqual(saved().countryCodes, []);
  assert.equal(saved().countryVersion, 2);
  assert.equal(core.inScope(saved(), scope), false);
  await insertSignals([{ ...incoming, title: "Kenya satellite service", publisherDomain: "nation.africa" }]);
  assert.deepEqual(saved().countryCodes, ["KE"]);
  await insertSignals([incoming]);
  assert.deepEqual(saved().countryCodes, []);
  assert.equal(saved().countryBasis, "unknown");
});

test("Africa recommendations API succeeds with legacy records in the corpus", async () => {
  db().prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
    .bind(article.id, article.url, JSON.stringify(article), article.collectedAt).run();
  assert.equal(getOverview(scope).total, 1);
  const response = await handleApi(
    new Request("http://localhost/api/research/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    }),
    "research/recommendations",
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 1);
});
