/** SQL 접근·기록 변환·중복 제거를 담당합니다. */
const { env } = require("./sqlite");
const { json, now, uid } = require("./utils");
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
    const results = await db().batch(
      unique
        .slice(offset, offset + SIGNAL_BATCH_SIZE)
        .map((signal) =>
          db()
            .prepare(
              "INSERT OR IGNORE INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)",
            )
            .bind(signal.id, signal.url, json(signal), signal.collectedAt),
        ),
    );
    added += results.reduce(
      (count, result) => count + Number(result.meta.changes || 0),
      0,
    );
  }
  return added;
}

module.exports = { db, rowData, log, getRecord, insertSignals };
