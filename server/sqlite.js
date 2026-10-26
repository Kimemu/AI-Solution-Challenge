/** Node.js 기본 SQLite 저장소입니다. */
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
let connection;
class Query {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Query(this.sql, values);
  }
  run() {
    const result = getConnection()
      .prepare(this.sql)
      .run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  first() {
    return (
      getConnection()
        .prepare(this.sql)
        .get(...this.values) || null
    );
  }
  all() {
    return {
      results: getConnection()
        .prepare(this.sql)
        .all(...this.values),
    };
  }
}
function getConnection() {
  if (connection) return connection;
  const filename =
    process.env.ORBITAL_DATABASE ||
    path.join(__dirname, "..", "data", "orbital.sqlite");
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  connection = new DatabaseSync(filename);
  connection.exec("PRAGMA journal_mode=WAL;");
  connection.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  if (
    process.env.ORBITAL_SEED_NEWS === "1" &&
    connection.prepare("SELECT count(*) AS count FROM signals").get().count ===
      0
  ) {
    const insert = connection.prepare(
      "INSERT OR IGNORE INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)",
    );
    for (const item of require("../assets/news-snapshot"))
      insert.run(item.id, item.url, JSON.stringify(item), item.collectedAt);
  }
  return connection;
}
const db = {
  prepare: (sql) => new Query(sql),
  batch(queries) {
    const sqlite = getConnection();
    sqlite.exec("BEGIN");
    try {
      const result = queries.map((query) => query.run());
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
module.exports = {
  env: { DB: db },
  closeDatabase() {
    connection?.close();
    connection = null;
  },
};
