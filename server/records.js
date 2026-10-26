/** 안건·의사결정·가정·실적의 업무 규칙입니다. */
const { investmentScore, sectorOf } = require("../js/config");
const { db, getRecord, log } = require("./database");
const { json, now, uid } = require("./utils");
const {
  asObject,
  number,
  required,
  safeUrl,
  scores,
  text,
} = require("./validation");
function normalize(kind, input, previous) {
  const data = { ...previous, ...asObject(input) };
  delete data.revision;
  if (previous?.researchId) {
    data.researchId = previous.researchId;
    data.autoDraft = previous.autoDraft;
    data.id = previous.id;
    data.userEdited = true;
  }
  if (kind === "opportunity") {
    const existingRecord =
      previous?.kind === "opportunity" ? previous : undefined;
    const amount = number(data.amount, true);
    if (amount !== null && amount < 0)
      throw new Error("검토 투자액은 0 이상이어야 합니다.");
    const normalizedScores = scores(data.scores);
    const score = investmentScore(normalizedScores);
    let stage = existingRecord?.stage || "watch";
    const gateThresholds =
      previous?.gateThresholds || require("../js/research-config").gates;
    if (previous?.autoDraft) {
      stage =
        data.manualStage === true
          ? [
              "watch",
              "diligence",
              "pilot",
              "approved",
              "hold",
              "rejected",
            ].includes(data.stage)
            ? data.stage
            : previous.stage
          : require("../js/research-core").stageFor(score, gateThresholds);
    }
    return {
      ...data,
      title: required(data.title, "안건명", 160),
      category: sectorOf(text(data.category)).id,
      thesis: required(data.thesis, "사업 가설", 3000),
      scores: normalizedScores,
      score,
      amount,
      owner: text(data.owner, 80) || "미지정",
      nextStep: text(data.nextStep, 1000),
      evidenceIds: Array.isArray(data.evidenceIds)
        ? data.evidenceIds.filter((id) => typeof id === "string").slice(0, 20)
        : [],
      stage,
      ...(previous?.autoDraft
        ? {
            gateTrace: Object.entries(gateThresholds).map(
              ([stage, threshold]) => ({
                stage,
                threshold,
                passed: score >= threshold,
              }),
            ),
          }
        : {}),
      sample: !!existingRecord?.sample,
    };
  }
  if (kind === "assumption") {
    const existingRecord =
      previous?.kind === "assumption" ? previous : undefined;
    return {
      ...data,
      title: required(data.title, "가정", 200),
      opportunityId: required(data.opportunityId, "관련 안건", 100),
      target: number(data.target),
      unit: required(data.unit, "단위", 20),
      dueDate: text(data.dueDate, 30),
      direction: data.direction === "lower" ? "lower" : "higher",
      actual: existingRecord?.actual ?? null,
      note: text(data.note, 2000),
    };
  }
  if (kind === "decision" && previous?.autoDraft) {
    if (
      !["watch", "diligence", "pilot", "approved", "hold", "rejected"].includes(
        data.outcome,
      )
    )
      throw new Error("검토 제안 단계를 선택해 주세요.");
    return {
      ...data,
      title: previous.title,
      rationale: required(data.rationale, "판단 근거", 4000),
      conditions: text(data.conditions, 2000),
    };
  }
  if (kind === "report" && previous?.researchId) {
    const fields = Object.fromEntries(
      [
        "title",
        "author",
        "department",
        "reviewer",
        "approver",
        "executive",
        "strategic",
        "economic",
        "commercial",
        "management",
        "risks",
        "request",
      ].map((key) => [key, text(data[key], key === "title" ? 200 : 8000)]),
    );
    if (!fields.title || !fields.request)
      throw new Error("보고서 제목과 결재 요청사항이 필요합니다.");
    const budget = require("./research-logic").budgetOf(data.budget);
    const focus = db()
      .prepare("SELECT data FROM records WHERE id=? AND kind='opportunity'")
      .bind(data.focusOpportunityId)
      .first();
    if (
      (!focus && data.focusOpportunityId) ||
      (focus && JSON.parse(focus.data).researchId !== previous.researchId)
    )
      throw new Error("이 분석에 속한 기준 안건을 선택해 주세요.");
    return {
      ...data,
      ...fields,
      budget,
      status: data.focusOpportunityId ? "draft" : "insufficient-evidence",
    };
  }
  throw new Error("지원하지 않는 기록 형식입니다.");
}
async function createRecord(body, actor) {
  const kind = text(body.kind);
  const normalized = normalize(kind, body.data);
  if ("opportunityId" in normalized)
    await getRecord(normalized.opportunityId, "opportunity");
  const id = uid();
  const timestamp = now();
  const data = { ...normalized, id, createdAt: timestamp };
  await db().batch([
    db()
      .prepare(
        "INSERT INTO records (id,kind,data,revision,updated_at) VALUES (?,?,?,1,?)",
      )
      .bind(id, kind, json(data), timestamp),
    log(
      kind === "opportunity" ? "검토 안건 등록" : "가정 등록",
      id,
      normalized.title,
      actor,
    ),
  ]);
  return { ...data, kind, revision: 1, updatedAt: timestamp };
}
async function updateRecord(id, body, actor) {
  const existingRecord = await getRecord(id);
  if (existingRecord.revision !== body.revision)
    throw new Error("CONFLICT:다른 화면에서 수정됐습니다. 다시 불러와 주세요.");
  if (
    !["opportunity", "assumption", "report"].includes(existingRecord.kind) &&
    !(existingRecord.kind === "decision" && existingRecord.autoDraft)
  )
    throw new Error("지원하지 않는 기록 형식입니다.");
  const normalized = normalize(existingRecord.kind, body.data, existingRecord);
  const timestamp = now();
  const result = await db()
    .prepare(
      "UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
    )
    .bind(json(normalized), timestamp, id, body.revision)
    .run();
  if (!result.meta.changes)
    throw new Error("CONFLICT:최신 기록을 다시 불러와 주세요.");
  await log("검토 내용 수정", id, normalized.title, actor).run();
  require("./research").syncGeneratedRecord({
    ...normalized,
    kind: existingRecord.kind,
  });
  return {
    ...normalized,
    revision: existingRecord.revision + 1,
    updatedAt: timestamp,
  };
}
async function decision(body, actor) {
  const outcome = text(body.outcome);
  const existingRecord = await getRecord(
    required(body.opportunityId, "관련 안건"),
    "opportunity",
  );
  if (existingRecord.revision !== body.revision)
    throw new Error("CONFLICT:최신 안건을 불러온 뒤 결정해 주세요.");
  if (!["diligence", "pilot", "approved", "hold", "rejected"].includes(outcome))
    throw new Error("유효한 결정 단계를 선택해 주세요.");
  const rationale = required(body.rationale, "결정 근거", 4000);
  if (
    ["pilot", "approved"].includes(outcome) &&
    !existingRecord.evidenceIds?.length
  )
    throw new Error("실증·추진 결정에는 근거 자료를 연결해 주세요.");
  const id = uid();
  const timestamp = now();
  const normalized = {
    id,
    opportunityId: existingRecord.id,
    title: existingRecord.title,
    before: existingRecord.stage,
    outcome: outcome,
    rationale,
    conditions: text(body.conditions, 2000),
    evidenceIds: existingRecord.evidenceIds,
    actor,
    at: timestamp,
  };
  const results = await db().batch([
    db()
      .prepare(
        "UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
      )
      .bind(
        json({ ...existingRecord, stage: outcome, lastDecisionId: id }),
        timestamp,
        existingRecord.id,
        body.revision,
      ),
    db()
      .prepare(
        "INSERT INTO records (id,kind,data,revision,updated_at) SELECT ?,'decision',?,1,? FROM records WHERE id=? AND json_extract(data,'$.lastDecisionId')=?",
      )
      .bind(id, json(normalized), timestamp, existingRecord.id, id),
  ]);
  if (!results[0].meta.changes)
    throw new Error(
      "CONFLICT:결정이 저장되지 않았습니다. 최신 안건을 불러와 주세요.",
    );
  await log(
    "의사결정",
    existingRecord.id,
    existingRecord.title + " → " + outcome + " · " + rationale.slice(0, 100),
    actor,
  ).run();
  return normalized;
}
async function actual(body, actor) {
  const existingRecord = await getRecord(
    required(body.assumptionId, "관련 가정"),
    "assumption",
  );
  if (existingRecord.revision !== body.revision)
    throw new Error("CONFLICT:최신 가정을 다시 불러와 주세요.");
  const value = number(body.value);
  const note = required(body.note, "실적 확인 근거", 2000);
  const id = uid();
  const timestamp = now();
  const normalized = {
    id,
    assumptionId: existingRecord.id,
    opportunityId: existingRecord.opportunityId,
    title: existingRecord.title,
    value,
    unit: existingRecord.unit,
    target: existingRecord.target,
    note,
    sourceUrl: safeUrl(body.sourceUrl),
    asOf: text(body.asOf, 30) || timestamp.slice(0, 10),
    actor,
    at: timestamp,
  };
  const results = await db().batch([
    db()
      .prepare(
        "UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
      )
      .bind(
        json({
          ...existingRecord,
          actual: value,
          lastActualAt: timestamp,
          lastPerformanceId: id,
        }),
        timestamp,
        existingRecord.id,
        body.revision,
      ),
    db()
      .prepare(
        "INSERT INTO records (id,kind,data,revision,updated_at) SELECT ?,'performance',?,1,? FROM records WHERE id=? AND json_extract(data,'$.lastPerformanceId')=?",
      )
      .bind(id, json(normalized), timestamp, existingRecord.id, id),
  ]);
  if (!results[0].meta.changes)
    throw new Error("CONFLICT:실적이 저장되지 않았습니다.");
  await log(
    "실적 업데이트",
    existingRecord.id,
    `${existingRecord.title} · ${value}${existingRecord.unit} (목표 ${existingRecord.target}${existingRecord.unit})`,
    actor,
  ).run();
  return normalized;
}
async function verify(body, actor) {
  const row = await db()
    .prepare("SELECT * FROM signals WHERE id=?")
    .bind(required(body.id, "정보 ID"))
    .first();
  if (!row) throw new Error("정보를 찾을 수 없습니다.");
  const data = JSON.parse(row.data);
  const note = required(body.note, "확인 내용", 2000);
  data.reviewed = true;
  data.reviewNote = note;
  data.verification = "원문 확인 기록";
  data.reviewedAt = now();
  await db().batch([
    db()
      .prepare("UPDATE signals SET data=? WHERE id=?")
      .bind(json(data), row.id),
    log("원문 확인", row.id, note, actor),
  ]);
  return data;
}
async function schedule(body) {
  const normalized = {
    id: "hourly-schedule",
    enabled: body.enabled === true,
    cadence: "hourly",
    timezone: "Asia/Seoul",
    automationId: required(body.automationId, "자동화 ID"),
    verifiedAt: now(),
  };
  await db()
    .prepare(
      "INSERT INTO records (id,kind,data,revision,updated_at) VALUES ('hourly-schedule','schedule',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at",
    )
    .bind(json(normalized), now())
    .run();
  return normalized;
}

module.exports = {
  normalize,
  createRecord,
  updateRecord,
  decision,
  actual,
  verify,
  schedule,
};
