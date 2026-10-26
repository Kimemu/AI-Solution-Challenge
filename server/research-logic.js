/** 기사 묶음 → 근거가 보이는 점수·단계·최소 PoC 예산·검증계획 초안. */
const { sectorOf, investmentScore } = require("../js/config");
const { gates: defaultGates } = require("../js/research-config");
const { stageFor, countryCounts } = require("../js/research-core");
const solutions = {
  maritime: [
    "해양 위험 모니터링 구독 서비스",
    "항만·선박 운영사",
    "위성·AIS로 위험 징후를 정리한 주간 알림과 대시보드",
    "시설·선박 수에 따른 월 구독",
    14,
  ],
  solar: [
    "태양광 발전 예측 데이터 서비스",
    "태양광·ESS 운영사",
    "위성 기상과 발전 실적을 연결한 발전량 예측 PoC",
    "사업장 단위 데이터 구독",
    12,
  ],
  infrastructure: [
    "시설 변위 조기경보 서비스",
    "시설 운영사·보험사",
    "반복 관측 자료를 이용한 지반변위 점검 우선순위 서비스",
    "시설별 분석 및 연간 모니터링 계약",
    16,
  ],
  emissions: [
    "산업시설 배출 점검 지원 서비스",
    "에너지 사업자·환경관리팀",
    "공개 배출 관측과 시설정보를 연결한 이상 징후 점검 보고서",
    "시설 단위 모니터링 구독",
    15,
  ],
  agriculture: [
    "작황·농업 위험 데이터 서비스",
    "농산물 조달사·농업보험사",
    "식생·수분·기상 정보를 결합한 작황 위험 대시보드",
    "지역 단위 분석 구독과 API 사용료",
    12,
  ],
  space: [
    "우주·위성 시장 인텔리전스 서비스",
    "우주사업 전략팀·기술 제휴팀",
    "발사·기술·계약 동향과 수요기업을 연결하는 의사결정 지원 서비스",
    "팀 단위 구독과 맞춤 조사",
    18,
  ],
};
function uniqueArticles(articles) {
  const seen = new Set();
  return [...articles]
    .sort((a, b) =>
      String(b.publishedAt || "").localeCompare(a.publishedAt || ""),
    )
    .filter((article) => {
      const key = article.title
        .replace(/\s+-\s+[^-]+$/, "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function budgetOf(input) {
  if (
    !input ||
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 30
  )
    throw new Error("예산 항목은 1~30개가 필요합니다.");
  const items = input.items.map((item) => {
    const quantity = Number(item.quantity),
      unitCost = Number(item.unitCost);
    if (
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      quantity > 10000 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0 ||
      unitCost > 1e9
    )
      throw new Error("예산 수량·단가를 확인해 주세요.");
    return {
      label: String(item.label || "예산 항목").slice(0, 120),
      unit: String(item.unit || "식").slice(0, 30),
      quantity,
      unitCost,
      subtotal: Math.round(quantity * unitCost),
    };
  });
  const reservePercent = Number(input.reservePercent ?? 15);
  if (
    !Number.isFinite(reservePercent) ||
    reservePercent < 0 ||
    reservePercent > 50
  )
    throw new Error("예비비는 0~50%로 입력해 주세요.");
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0),
    reserve = Math.round((subtotal * reservePercent) / 100);
  return {
    items,
    subtotal,
    reservePercent,
    reserve,
    total: subtotal + reserve,
    currency: "KRW",
    basis: "내부 계획단가에 따른 8주 PoC 추정 · 부가세 별도 · 견적 확인 전",
    assumptions: String(
      input.assumptions ||
        "기존 PC와 공개 데이터를 사용합니다. 위성 제작·발사, 대규모 상용 인프라와 후속 운영비는 포함하지 않습니다. 실제 견적에 따라 조정합니다.",
    ).slice(0, 2000),
  };
}
function initialBudget(category) {
  return budgetOf({
    items: [
      {
        label: "고객 인터뷰·요구사항",
        unit: "인일",
        quantity: 3,
        unitCost: 300000,
      },
      {
        label: "데이터 검토·정제",
        unit: "인일",
        quantity: 5,
        unitCost: 400000,
      },
      {
        label: "분석·대시보드 프로토타입",
        unit: "인일",
        quantity: solutions[category][4],
        unitCost: 450000,
      },
      { label: "검증·결과 보고", unit: "인일", quantity: 5, unitCost: 350000 },
      {
        label: "클라우드·테스트 환경",
        unit: "월",
        quantity: 2,
        unitCost: 150000,
      },
      {
        label: "소규모 데이터 이용 가정",
        unit: "식",
        quantity: 1,
        unitCost: 500000,
      },
    ],
    reservePercent: 15,
  });
}
function scoreIdea(articles, category, gates = defaultGates) {
  const sources = new Set(
    articles.map((article) => article.publisherDomain || article.source),
  ).size;
  const count = articles.length;
  const text = articles
    .map((article) =>
      [
        article.title,
        article.articleAnalysis?.analysisBasis === "article-body"
          ? article.articleAnalysis.summary
          : "",
      ].join(" "),
    )
    .join(" ");
  const scores = {
    fit: count >= 3 ? 4 : 3,
    demand: Math.min(
      5,
      2 + (count >= 3 ? 1 : 0) + (count >= 6 ? 1 : 0) + (sources >= 4 ? 1 : 0),
    ),
    economics: Math.min(
      5,
      2 +
        (/contract|funding|investment|투자|계약|수주/i.test(text) ? 1 : 0) +
        (/revenue|profit|sales|매출|이익/i.test(text) ? 1 : 0),
    ),
    moat: Math.min(
      5,
      2 +
        (/satellite|SAR|위성|특허|patent|AI|sensor|센서/i.test(text) ? 1 : 0) +
        (sources >= 3 ? 1 : 0),
    ),
  };
  const score = investmentScore(scores),
    stage = stageFor(score, gates);
  const scoreReasons = {
    fit: `${sectorOf(category).affiliate} 연계 가설. 관련 독립 기사 ${count}건. 실제 역량은 확인 전.`,
    demand: `${sources}개 매체·${count}개 기사에 나타난 관심 빈도. 유료 수요 확인을 대체하지 않음.`,
    economics:
      "제목·본문 기반 요약의 계약·투자·수익 언급 여부로 평가. 매출·ROI 추정치는 없음.",
    moat: "기술 키워드와 매체 다양성 기반 초기 가설. 특허·독점성 검증 전.",
  };
  const gateTrace = Object.entries(gates).map(([stage, threshold]) => ({
    stage,
    threshold,
    passed: score >= threshold,
  }));
  return {
    scores,
    score,
    stage,
    scoreReasons,
    gateTrace,
    gateThresholds: { ...gates },
    scoringMethod:
      "근거 기반 규칙 평가 v1 · 적합도30/관심빈도25/수익신호25/기술차별20",
  };
}
function ideaDrafts(articles, keyword, gates = defaultGates) {
  const groups = new Map();
  for (const article of uniqueArticles(articles)) {
    const category = sectorOf(article.category).id;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(article);
  }
  return [...groups]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([category, evidence]) => {
      const [title, customer, solution, revenueModel] = solutions[category];
      const budget = initialBudget(category);
      return {
        title: `${keyword} · ${title}`,
        category,
        thesis: `선택 키워드 '${keyword}' 관련 ${evidence.length}개 기사를 바탕으로 ${customer}의 정보 공백을 해결할 ${solution}를 검토합니다.`,
        customer,
        solution,
        revenueModel,
        problem: evidence
          .slice(0, 3)
          .map((article) => article.title)
          .join(" / "),
        evidenceIds: evidence.slice(0, 20).map((article) => article.id),
        countries: countryCounts(evidence).map((country) => country.code),
        budget,
        amount: budget.total / 1e8,
        ...scoreIdea(evidence, category, gates),
        owner: "담당자 지정 필요",
        nextStep: "고객 인터뷰 5건 → 데이터 권리·품질 점검 → 8주 PoC",
        risks:
          "뉴스 관심은 구매 의향과 다를 수 있습니다. 데이터 사용권·현장 성능·고객 예산을 확인해야 합니다.",
        generationMethod: "기사 분야·반복 빈도 기반 초안",
        autoDraft: true,
        sample: false,
      };
    });
}
function assumptionsFor(idea, researchId, date) {
  const dueDate = new Date(Date.parse(date) + 56 * 86400000)
    .toISOString()
    .slice(0, 10);
  return [
    [
      "우선 고객 인터뷰",
      5,
      "건",
      "higher",
      "예상 고객 5곳의 업무·지불 의향을 인터뷰하고 근거를 첨부합니다.",
    ],
    [
      "PoC 데이터 확보율",
      80,
      "%",
      "higher",
      "필요한 데이터 목록 대비 접근·이용권이 확인된 비율을 측정합니다.",
    ],
    [
      "PoC 예산 상한",
      idea.budget.total,
      "원",
      "lower",
      "계획 예산과 실제 지출을 비교합니다. 현재 실적은 입력되지 않았습니다.",
    ],
  ].map(([title, target, unit, direction, note], index) => ({
    id: `${idea.id}-assumption-${index}`,
    title,
    opportunityId: idea.id,
    researchId,
    target,
    unit,
    direction,
    note,
    dueDate,
    actual: null,
    autoDraft: true,
    createdAt: date,
  }));
}
module.exports = {
  uniqueArticles,
  budgetOf,
  initialBudget,
  scoreIdea,
  ideaDrafts,
  assumptionsFor,
};
