import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-test-"));
process.env.ORBITAL_DATABASE = path.join(temporary, "test.sqlite");
process.env.ORBITAL_SEED_NEWS = "0";
const { server } = require("../server.js");
const { closeDatabase } = require("../server/sqlite.js");

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
  let response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>ORBITAL/);
  response = await fetch(base + "/server/records.js");
  assert.equal(response.status, 404);
  response = await fetch(base + "/.git/config");
  assert.equal(response.status, 404);
  response = await fetch(base + "/api/state", { headers: { Origin: "null" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "null");
  assert.equal((await response.json()).signals.length, 6);
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
