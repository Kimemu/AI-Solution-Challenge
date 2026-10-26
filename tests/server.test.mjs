import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-test-"));
process.env.ORBITAL_DATABASE = path.join(temporary, "test.sqlite");
delete process.env.ORBITAL_SEED_NEWS;
const { server } = require("../server.js");
const { closeDatabase } = require("../server/sqlite.js");
const { db } = require("../server/database.js");

test("the dependency-free server serves HTML, protects internal files and supports file-origin API calls", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    assert.ok(
      path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const repeated = await promisify(execFile)(process.execPath, ["server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(server.address().port),
    },
    timeout: 10000,
  });
  assert.match(repeated.stdout, /Opening existing server/);
  assert.equal(repeated.stderr, "");
  let response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>ORBITAL/);
  response = await fetch(base + "/server/records.js");
  assert.equal(response.status, 404);
  response = await fetch(base + "/.git/config");
  assert.equal(response.status, 404);
  response = await fetch(base + "/api/update-manifest");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).maxItemsPerSource, 20);
  response = await fetch(base + "/api/state", { headers: { Origin: "null" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "null");
  assert.equal((await response.json()).signals.length, 6);
  const now = new Date().toISOString();
  for (const signal of [
    { id: "test-live", url: "https://example.test/live", lastSeenAt: now },
    { id: "test-stale", url: "https://example.test/stale" },
    { id: "test-failed", url: "https://example.test/failed", lastSeenAt: now },
  ]) {
    db()
      .prepare("INSERT INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)")
      .bind(signal.id, signal.url, JSON.stringify({ ...signal, kind: "news" }), now)
      .run();
  }
  db()
    .prepare(
      "INSERT INTO article_jobs (signal_id,status,error,updated_at) VALUES (?,?,?,?)",
    )
    .bind("test-failed", "failed", "원문 접근 차단", now)
    .run();
  const visibleSignals = (await (await fetch(base + "/api/state")).json()).signals;
  assert.ok(visibleSignals.some((signal) => signal.id === "test-live"));
  assert.ok(!visibleSignals.some((signal) => signal.id === "test-stale"));
  assert.ok(!visibleSignals.some((signal) => signal.id === "test-failed"));
  response = await fetch(base + "/api/records", {
    method: "OPTIONS",
    headers: { Origin: "null", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(response.status, 204);
  response = await fetch(base + "/api/records", {
    method: "POST",
    headers: { Origin: "null", "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "opportunity",
      data: {
        title: "재시작 후 유지 확인",
        category: "space",
        thesis: "서버를 다시 열어도 SQLite 기록이 유지된다.",
        scores: { fit: 3, demand: 3, economics: 3, moat: 3 },
        amount: null,
      },
    }),
  });
  assert.equal(response.status, 200);
  const created = await response.json();
  closeDatabase();
  response = await fetch(base + "/api/state");
  assert.ok(
    (await response.json()).records.some((record) => record.id === created.id),
  );
  // LAN 접속 주소와 수신 주소가 달라도 같은 출처의 팀원 쓰기가 성공해야 합니다.
  const teamOrigin = "http://192.168.1.20:" + server.address().port;
  const teamResult = await new Promise((resolve, reject) => {
    const request = http.request(
      base + "/api/records",
      {
        method: "POST",
        headers: {
          Host: new URL(teamOrigin).host,
          Origin: teamOrigin,
          "Content-Type": "application/json",
        },
      },
      (result) => {
        let body = "";
        result.setEncoding("utf8");
        result.on("data", (chunk) => (body += chunk));
        result.on("end", () => resolve({ status: result.statusCode, body }));
      },
    );
    request.on("error", reject);
    request.end(
      JSON.stringify({
        kind: "opportunity",
        data: {
          title: "팀원이 작성한 안건",
          category: "space",
          thesis: "다른 브라우저에서도 같은 자료를 조회한다.",
          scores: { fit: 3, demand: 3, economics: 3, moat: 3 },
          amount: null,
        },
      }),
    );
  });
  assert.equal(teamResult.status, 200, teamResult.body);
  const teamRecord = JSON.parse(teamResult.body);
  response = await fetch(base + "/api/state");
  assert.ok(
    (await response.json()).records.some(
      (record) => record.id === teamRecord.id,
    ),
  );
  response = await fetch(base + "/api/records", {
    method: "OPTIONS",
    headers: { Origin: base, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(response.status, 204);
  response = await fetch(base + "/api/records", {
    method: "POST",
    headers: {
      Origin: "https://other.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
});

test("an unrelated occupied port is not treated as ORBITAL", async (t) => {
  const other = http.createServer((_request, response) =>
    response.end("Other service"),
  );
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => other.close(resolve)));
  await assert.rejects(
    promisify(execFile)(process.execPath, ["server.js"], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(other.address().port),
      },
      timeout: 10000,
    }),
    (error) => error.code === 1 && /another service/.test(error.stderr),
  );
});
