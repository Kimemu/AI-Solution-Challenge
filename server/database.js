/** SQL 접근·기록 변환·중복 제거를 담당합니다. */
const { env } = require("./sqlite");
const { json, now, uid } = require("./utils");
const { enrich } = require("../js/research-core");
function db() {
  if (!env.DB) throw new Error("저장소 연결을 확인해 주세요.");
  return env.DB;
}
function rowData(row) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    kind: row.kind,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
function log(action, id, detail, actor) {
  return db()
    .prepare(
      "INSERT INTO audit (id,action,entity_id,detail,actor,at) VALUES (?,?,?,?,?,?)",
    )
    .bind(uid(), action, id, detail, actor, now());
}
async function getRecord(id, kind) {
  const row = await db()
    .prepare("SELECT * FROM records WHERE id=?")
    .bind(id)
    .first();
  if (!row || (kind && row.kind !== kind))
    throw new Error("기록을 찾을 수 없습니다.");
  return rowData(row);
}
const SIGNAL_BATCH_SIZE = 30;
async function insertSignals(signals) {
  const seen = new Set();
  const unique = signals.filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
  let added = 0;
  for (let offset = 0; offset < unique.length; offset += SIGNAL_BATCH_SIZE) {
    const chunk = unique.slice(offset, offset + SIGNAL_BATCH_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const existingRows = await db()
      .prepare(`SELECT id,data FROM signals WHERE id IN (${placeholders})`)
      .bind(...chunk.map((signal) => signal.id))
      .all();
    const existing = new Map(
      existingRows.results.map((row) => [row.id, row.data]),
    );
    const operations = chunk.map((signal) => {
      const previous = existing.get(signal.id);
      if (!previous)
        return {
          insert: true,
          query: db()
            .prepare(
              "INSERT OR IGNORE INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)",
            )
            .bind(
              signal.id,
              signal.url,
              json({ ...enrich(signal), lastSeenAt: signal.collectedAt }),
              signal.collectedAt,
            ),
        };
      const current = JSON.parse(previous);
      const refreshed = {
        ...current,
        title: signal.title,
        source: signal.source,
        feed: signal.feed,
        official: signal.official,
        category: signal.category,
        publishedAt: signal.publishedAt || current.publishedAt,
        verification: signal.verification,
        entities: signal.entities,
        signalType: signal.signalType,
        lastSeenAt: signal.collectedAt,
        publisherDomain: signal.publisherDomain || current.publisherDomain,
        countryVersion: 0,
      };
      if (!current.articleAnalysis) refreshed.summary = signal.summary;
      return {
        insert: false,
        query: db()
          .prepare("UPDATE signals SET url=?,data=? WHERE id=?")
          .bind(signal.url, json(enrich(refreshed)), signal.id),
      };
    });
    const results = await db().batch(operations.map(({ query }) => query));
    added += results.reduce(
      (count, result, index) =>
        count + Number(operations[index].insert && result.meta.changes > 0),
      0,
    );
  }
  return added;
}

module.exports = { db, rowData, log, getRecord, insertSignals };
