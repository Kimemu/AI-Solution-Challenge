import assert from "node:assert/strict";
import { createRequire } from "node:module";
process.env.ORBITAL_DATABASE = ":memory:";
process.env.ORBITAL_SEED_NEWS = "0";
const require = createRequire(import.meta.url);
const { handleApi } = require("../server/api.js");
const call = async (path, method = "GET", data, headers = {}) => {
  const r = await handleApi(
    new Request("https://example.test/api/" + path, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(data || {}),
    }),
    path,
  );
  return { status: r.status, data: await r.json() };
};
let checks = 0;
const ok = (x) => {
  assert.ok(x);
  checks++;
};
let s = (await call("state")).data;
ok(
  s.signals.length === 6 &&
    s.records.filter((x) => x.kind === "opportunity").length === 3,
);
ok(!s.records.some((x) => x.kind === "decision" || x.kind === "performance"));
ok(
  (
    await call("records", "POST", {
      kind: "opportunity",
      data: { title: "missing" },
    })
  ).status === 400,
);
let o = (
  await call("records", "POST", {
    kind: "opportunity",
    data: {
      title: "검증용 에너지 데이터 PoC",
      category: "solar",
      thesis: "예측 데이터의 운영 가치를 실증한다.",
      scores: { fit: 5, demand: 5, economics: 5, moat: 5 },
      amount: "",
      evidenceIds: [],
    },
  })
).data;
ok(o.score === 100 && o.amount === null && !o.sample);
ok(
  (
    await call("decisions", "POST", {
      opportunityId: o.id,
      revision: o.revision,
      outcome: "pilot",
      rationale: "근거 부족",
    })
  ).status === 400,
);
o = (
  await call("records/" + o.id, "PATCH", {
    revision: o.revision,
    data: { evidenceIds: ["reference-solar"] },
  })
).data;
ok(o.revision === 2);
ok(
  (
    await call("records/" + o.id, "PATCH", {
      revision: 1,
      data: { title: "충돌" },
    })
  ).status === 409,
);
ok(
  (
    await call("decisions", "POST", {
      opportunityId: o.id,
      revision: o.revision,
      outcome: "approved",
      rationale: "",
    })
  ).status === 400,
);
ok(
  (
    await call("decisions", "POST", {
      opportunityId: o.id,
      revision: o.revision,
      outcome: "pilot",
      rationale: "제휴 조건과 데이터 단가를 검증한다.",
      conditions: "고객 인터뷰 확인",
    })
  ).status === 200,
);
s = (await call("state")).data;
ok(
  s.records.find((x) => x.id === o.id).stage === "pilot" &&
    s.records.filter((x) => x.kind === "decision").length === 1,
);
let a = (
  await call("records", "POST", {
    kind: "assumption",
    data: {
      opportunityId: o.id,
      title: "예측 오차율",
      target: 10,
      unit: "%",
      direction: "lower",
    },
  })
).data;
ok(a.actual === null);
ok(
  (
    await call("actuals", "POST", {
      assumptionId: a.id,
      revision: a.revision,
      value: 8,
      note: "",
    })
  ).status === 400,
);
ok(
  (
    await call("actuals", "POST", {
      assumptionId: a.id,
      revision: a.revision,
      value: "",
      note: "확인",
    })
  ).status === 400,
);
ok(
  (
    await call("actuals", "POST", {
      assumptionId: a.id,
      revision: a.revision,
      value: 8,
      note: "측정 보고서",
      asOf: "2026-10-20",
    })
  ).status === 200,
);
ok(
  (
    await call("actuals", "POST", {
      assumptionId: a.id,
      revision: a.revision,
      value: 9,
      note: "stale",
    })
  ).status === 409,
);
s = (await call("state")).data;
ok(
  s.records.find((x) => x.id === a.id).actual === 8 &&
    s.records.filter((x) => x.kind === "performance").length === 1,
);
ok(
  (
    await call("verify", "POST", {
      id: "reference-solar",
      note: "공식 방법론 원문을 확인했다. 실제 운영 성과는 별도 검증 필요.",
    })
  ).status === 200,
);
globalThis.fetch = async () =>
  new Response(
    "<rss><channel><item><title>Satellite methane monitoring earns new contract</title><link>https://example.com/contract</link><description>Facility monitoring</description><pubDate>" +
      new Date().toUTCString() +
      "</pubDate></item></channel></rss>",
  );
let run = (await call("refresh", "POST")).data;
ok(run.status === "success" && run.added === 1);
ok((await call("refresh", "POST")).data.throttled === true);
require("../server/sqlite")
  .env.DB.prepare("UPDATE records SET updated_at=? WHERE id='refresh-lock'")
  .bind(new Date(Date.now() - 120000).toISOString())
  .run();
let f = 0;
globalThis.fetch = async () => {
  f++;
  if (f === 1) throw Error("source unavailable");
  return new Response(
    "<rss><channel><item><title>Satellite methane monitoring earns new contract</title><link>https://example.com/contract</link></item></channel></rss>",
  );
};
run = (await call("refresh", "POST")).data;
ok(run.status === "partial" && run.added === 0);
s = (await call("state")).data;
ok(
  s.signals.filter((x) => x.url === "https://example.com/contract").length ===
    1 && s.audit.length >= 7,
);
ok(
  s.signals.find((x) => x.url === "https://example.com/contract").category ===
    "emissions",
);
ok(s.signals.find((x) => x.id === "reference-solar").reviewed === true);
ok(
  (
    await call(
      "records",
      "POST",
      { kind: "opportunity", data: {} },
      { Origin: "https://evil.test" },
    )
  ).status === 403,
);
let ingested = (
  await call("ingest", "POST", {
    sources: [
      {
        id: "news-solar",
        status: "ok",
        items: [
          {
            title: "Qcells solar contract",
            url: "https://example.com/solar",
            official: true,
            publishedAt: new Date().toISOString(),
          },
          { title: "invalid", url: "javascript:alert(1)" },
        ],
      },
    ],
  })
).data;
ok(ingested.added === 1 && ingested.status === "partial");
s = (await call("state")).data;
ok(
  s.runs.some((x) => x.id === ingested.runId) &&
    s.signals.find((x) => x.url === "https://example.com/solar").official ===
      false,
);
console.log(
  JSON.stringify({
    workflowChecks: checks,
    passed: true,
    checks:
      "persistence, evidence gating, score, concurrency, decisions, assumption/actual history, verification, RSS classification/dedup/partial failure, cross-origin writes",
  }),
);
