/** 기본 자료를 준비하고 화면에 필요한 상태를 조회합니다. */
const { investmentScore, sectorOf, sourceFeeds } = require("../js/config");
const { db, rowData } = require("./database");
const { analysis } = require("./signals");
const { json, now } = require("./utils");
const { enrich } = require("../js/research-core");
async function initialize() {
  const seeds = [
    [
      "reference-maritime",
      "maritime",
      "SAR와 AIS를 결합한 해양 감시 서비스",
      "ESA Space Solutions",
      "https://business.esa.int/projects/seascope",
      "위성영상과 AIS를 결합해 해양시설과 유출 의심 구역을 감시하는 서비스 소개입니다.",
    ],
    [
      "reference-solar",
      "solar",
      "위성 구름 추적을 활용한 일사량 예측",
      "Solcast",
      "https://www.solcast.com/irradiance-data-methodology",
      "기상위성 관측과 수치예보를 결합한 일사량 예측 방법의 사업자 설명입니다.",
    ],
    [
      "reference-infrastructure",
      "infrastructure",
      "위성 지반변위 감시 서비스 EGMS",
      "Copernicus",
      "https://land.copernicus.eu/en/products/european-ground-motion-service",
      "반복 SAR 자료로 지반변위를 분석하는 공식 서비스 소개입니다.",
    ],
    [
      "reference-emissions",
      "emissions",
      "시설 단위 메탄 배출 위성 모니터링",
      "GHGSat",
      "https://www.ghgsat.com/industries/oil-and-gas-methane-monitoring/",
      "전용 센서를 사용하는 시설 단위 배출 감시 서비스의 사업자 설명입니다.",
    ],
    [
      "reference-agriculture",
      "agriculture",
      "토양수분·식생 정보를 활용한 농업 분석",
      "USDA",
      "https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_cropcasma.htm",
      "토양수분과 식생 지수를 활용하는 농업 정보 서비스의 공식 설명입니다.",
    ],
    [
      "reference-space",
      "space",
      "한화 누리호 기술이전과 통합 우주사업 방향",
      "Hanwha",
      "https://www.hanwha.com/newsroom/news/press-releases/hanwha-aerospace-to-receive-full-technology-transfer-for-south-koreas-homegrown-space-rocket-nuri.do",
      "한화가 공개한 누리호 기술이전 및 우주사업 가치사슬 연결 방향입니다.",
    ],
  ];
  const t = now();
  await db().batch(
    seeds.map(([id, category, title, source, url, summary]) =>
      db()
        .prepare(
          "INSERT OR IGNORE INTO signals (id,url,data,collected_at) VALUES (?,?,?,?)",
        )
        .bind(
          id,
          url,
          json({
            id,
            category,
            title,
            source,
            url,
            summary,
            publishedAt: null,
            collectedAt: t,
            kind: "reference",
            verification: "공식 소개자료",
            official: true,
            entities: [source],
            ...analysis(category),
          }),
          t,
        ),
    ),
  );
  for (const [category, title] of [
    ["maritime", "해양 감시 데이터 서비스 검토"],
    ["solar", "위성 기반 태양광 예측 PoC"],
    ["infrastructure", "사업장 지반변위 분석 실증"],
  ]) {
    const id = "sample-" + category;
    const s = { fit: 4, demand: 3, economics: 3, moat: 3 };
    await db()
      .prepare(
        "INSERT OR IGNORE INTO records (id,kind,data,revision,updated_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        id,
        "opportunity",
        json({
          id,
          title,
          category,
          stage: "watch",
          sample: true,
          thesis: sectorOf(category).question,
          scores: s,
          score: investmentScore(s),
          amount: null,
          owner: "미지정",
          nextStep: "고객 인터뷰와 데이터 조달 조건 확인",
          evidenceIds: ["reference-" + category],
          createdAt: t,
        }),
        1,
        t,
      )
      .run();
  }
}
async function getState() {
  await initialize();
  const [sig, rec, logs, runs] = await Promise.all([
    db()
      .prepare(
        "SELECT s.* FROM signals s WHERE json_extract(s.data,'$.lastSeenAt') IS NOT NULL OR s.id LIKE 'reference-%' OR EXISTS (SELECT 1 FROM records r, json_each(r.data, '$.evidenceIds') e WHERE r.kind='opportunity' AND e.value=s.id) ORDER BY COALESCE(json_extract(s.data,'$.lastSeenAt'),s.collected_at) DESC LIMIT 500",
      )
      .all(),
    db()
      .prepare("SELECT * FROM records WHERE kind != ? ORDER BY updated_at DESC")
      .bind("system")
      .all(),
    db().prepare("SELECT * FROM audit ORDER BY at DESC LIMIT 100").all(),
    db()
      .prepare("SELECT * FROM refresh_runs ORDER BY started_at DESC LIMIT 20")
      .all(),
  ]);
  return {
    signals: (
      await Promise.all(
        sig.results.map(async (r) => {
          const job = await db()
            .prepare(
              "SELECT status,error,updated_at FROM article_jobs WHERE signal_id=?",
            )
            .bind(r.id)
            .first();
          const signal = enrich(JSON.parse(r.data));
          if (signal.articleAnalysis) {
            signal.articleAnalysis = { ...signal.articleAnalysis };
            delete signal.articleAnalysis.fullText;
          }
          if (signal.keywordAnalysis) {
            signal.keywordAnalysis = { ...signal.keywordAnalysis };
            delete signal.keywordAnalysis.fullText;
          }
          delete signal.feedExcerpt;
          if (signal.articleContent) {
            signal.articleContent = {
              ...signal.articleContent,
              textLength: signal.articleContent.fullText?.length || 0,
            };
            delete signal.articleContent.fullText;
          }
          delete signal.previousArticleAnalysis;
          return { ...signal, articleJob: job || null };
        }),
      )
    ).filter((signal) => signal.articleJob?.status !== "failed"),
    records: rec.results.map(rowData),
    audit: logs.results,
    runs: runs.results.map((r) => ({
      ...r,
      details: JSON.parse(r.details),
    })),
    sources: sourceFeeds.map(({ id, name, official, category }) => ({
      id,
      name,
      official,
      category,
    })),
    serverAt: now(),
  };
}

module.exports = { initialize, getState };
