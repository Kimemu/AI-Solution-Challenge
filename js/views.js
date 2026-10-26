// 화면별 함수는 HTML 템플릿을 반환합니다. 상태와 API는 app.js에서 관리합니다.
(function () {
  const { html, attributes, svgIcon } = window.OrbitalUI;
  const {
    sectors,
    stages,
    sectorOf,
    investmentScore,
    DEFAULT_SCORES,
    SCORE_CRITERIA,
  } = window.OrbitalConfig;
  const Ship = (props = {}) => svgIcon("Ship", props);
  const Sun = (props = {}) => svgIcon("Sun", props);
  const Building2 = (props = {}) => svgIcon("Building2", props);
  const Wind = (props = {}) => svgIcon("Wind", props);
  const Sprout = (props = {}) => svgIcon("Sprout", props);
  const Globe2 = (props = {}) => svgIcon("Globe2", props);
  const BookOpen = (props = {}) => svgIcon("BookOpen", props);
  const Target = (props = {}) => svgIcon("Target", props);
  const renderGlobePlaceholder = () => html`<div id="globe-root"></div>`;
  const Check = (props = {}) => svgIcon("Check", props);
  const Loader2 = (props = {}) => svgIcon("Loader2", props);
  const AlertCircle = (props = {}) => svgIcon("AlertCircle", props);
  const CheckCircle2 = (props = {}) => svgIcon("CheckCircle2", props);
  const X = (props = {}) => svgIcon("X", props);
  const FileCheck2 = (props = {}) => svgIcon("FileCheck2", props);
  const ArrowRight = (props = {}) => svgIcon("ArrowRight", props);
  const Search = (props = {}) => svgIcon("Search", props);
  const ShieldCheck = (props = {}) => svgIcon("ShieldCheck", props);
  const ArrowUpRight = (props = {}) => svgIcon("ArrowUpRight", props);
  const Activity = (props = {}) => svgIcon("Activity", props);
  const ChevronRight = (props = {}) => svgIcon("ChevronRight", props);
  const Clock = (props = {}) => svgIcon("Clock", props);
  const History = (props = {}) => svgIcon("History", props);
  const Layers3 = (props = {}) => svgIcon("Layers3", props);
  const Radio = (props = {}) => svgIcon("Radio", props);
  const TrendingUp = (props = {}) => svgIcon("TrendingUp", props);
  const Plus = (props = {}) => svgIcon("Plus", props);
  const RefreshCw = (props = {}) => svgIcon("RefreshCw", props);
  const ExternalLink = (props = {}) => svgIcon("ExternalLink", props);
  const SlidersHorizontal = (props = {}) => svgIcon("SlidersHorizontal", props);
  const Orbit = (props = {}) => svgIcon("Orbit", props);
  const Settings2 = (props = {}) => svgIcon("Settings2", props);
  const Database = (props = {}) => svgIcon("Database", props);
  const Download = (props = {}) => svgIcon("Download", props);
  const icons = {
    maritime: Ship,
    solar: Sun,
    infrastructure: Building2,
    emissions: Wind,
    agriculture: Sprout,
    space: Orbit,
  };
  const navs = [
    { id: "overview", name: "글로벌 인사이트", icon: Globe2 },
    { id: "knowledge", name: "뉴스·지식베이스", icon: BookOpen },
    { id: "pipeline", name: "사업·투자 검토", icon: Layers3 },
    { id: "decisions", name: "의사결정 기록", icon: FileCheck2 },
    { id: "performance", name: "가정·실적 관리", icon: Target },
    { id: "sources", name: "수집·업데이트", icon: Database },
    { id: "reports", name: "최종보고서", icon: FileCheck2 },
  ];
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  function formatDate(value, withTime = false) {
    if (!value) return "발행일 미표기";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "발행일 미표기";
    return (withTime ? dateTimeFormatter : dateFormatter).format(parsed);
  }
  const getStageName = (id) =>
    stages.find((stage) => stage.id === id)?.name || id || "기회 발굴";
  // 실적 입력
  function renderActualForm({ busy, modal, save }) {
    return html`<form
      class="editor-form"
      ${attributes({
        onSubmit: async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await save("actuals", {
            ...Object.fromEntries(f.entries()),
            assumptionId: modal.data.id,
            revision: modal.data.revision,
          });
        },
      })}
    >
      <div class="form-context">
        <b>${modal.data.title}</b
        ><span
          >목표 ${modal.data.target}${modal.data.unit}
          ·${" "}${modal.data.direction === "lower"
            ? "낮을수록 유리"
            : "높을수록 유리"}</span
        >
      </div>
      <div class="form-row">
        <label
          >확인된 실적 (${modal.data.unit})<input
            name="value"
            type="number"
            step="any"
            required /></label
        ><label
          >실적 기준일<input
            name="asOf"
            type="date"
            required${attributes({
              defaultValue: new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Seoul",
              }),
            })}
        /></label>
      </div>
      <label
        >확인 근거 <span class="required">필수</span
        ><textarea
          name="note"
          required${attributes({ rows: 3 })}
          placeholder="자료명·측정 조건·확인한 내용 등을 기록해 주세요."
        ></textarea></label
      ><label
        >자료 링크 (선택)<input
          name="sourceUrl"
          type="url"
          placeholder="https://"
      /></label>
      <div class="form-note">
        새 실적은 이전 기록과 함께 보존되며 목표 대비 차이에 반영됩니다.
      </div>
      <div class="modal-actions">
        <button class="primary" ${attributes({ disabled: busy })}>
          ${busy
            ? Loader2({ className: "spin", size: 14 })
            : Check({ size: 14 })}${" "}실적
          기록
        </button>
      </div>
    </form>`;
  }
  // 가정 입력
  function renderAssumptionForm({ busy, modal, opportunities, save }) {
    return html`<form
      class="editor-form"
      ${attributes({
        onSubmit: async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const d = Object.fromEntries(f.entries());
          if (modal.data?.id)
            await save(
              "records/" + modal.data.id,
              { revision: modal.data.revision, data: d },
              "PATCH",
            );
          else await save("records", { kind: "assumption", data: d });
        },
      })}
    >
      <label
        >관련 안건<select
          name="opportunityId"
          required${attributes({
            defaultValue: modal.data?.opportunityId || "",
          })}
        >
          <option value="" disabled>검토 안건 선택</option>
          ${opportunities.map(
            (o) =>
              html`<option${attributes({ value: o.id })}>${o.title}${o.sample ? " (예시)" : ""}</option>`,
          )}
        </select></label
      ><label
        >검증할 가정·지표<input
          name="title"
          required${attributes({ defaultValue: modal.data?.title })}
          placeholder="예: 태양광 발전 예측 오차율"
      /></label>
      <div class="form-row">
        <label
          >목표 값<input
            type="number"
            step="any"
            name="target"
            required${attributes({
              defaultValue: modal.data?.target,
            })} /></label
        ><label
          >단위<input
            name="unit"
            required${attributes({ defaultValue: modal.data?.unit })}
            placeholder="%, 원, 건, 일"
        /></label>
      </div>
      <div class="form-row">
        <label
          >판단 방향<select
            name="direction"
            ${attributes({ defaultValue: modal.data?.direction || "higher" })}
          >
            <option value="higher">높을수록 유리</option>
            <option value="lower">낮을수록 유리</option>
          </select></label
        ><label
          >검증 기한<input
            type="date"
            name="dueDate"
            ${attributes({ defaultValue: modal.data?.dueDate })}
        /></label>
      </div>
      <label
        >가정의 근거·검증 방법<textarea
          name="note"
          ${attributes({ defaultValue: modal.data?.note })}${attributes({
            rows: 3,
          })}
          placeholder="초기 가정을 정한 이유와 실적을 확인할 자료"
        ></textarea>
      </label>
      <div class="modal-actions">
        <button class="primary" ${attributes({ disabled: busy })}>
          ${busy
            ? Loader2({ className: "spin", size: 14 })
            : Check({ size: 14 })}${" "}가정
          저장
        </button>
      </div>
    </form>`;
  }
  // 전체 화면의 틀
  function renderDashboard() {
    const model = window.OrbitalApp.getModel();
    const { toast, error, load, view } = model;
    return html`<div class="app-shell">
      ${renderSidebar({ ...model })}
      <div class="main-shell">
        ${renderTopbar({ ...model })}
        <main class="content">
          ${renderPageHeading({
            ...model,
          })}${window.OrbitalResearchViews.context(model)}${error &&
          html`<div class="error-banner">${AlertCircle({ size: 16 })}${error}<button${attributes({ onClick: load })}>다시 연결</button></div>`}${view ===
            "overview" && window.OrbitalResearchViews.explore(model)}${view ===
            "knowledge" && window.OrbitalResearchViews.explore(model, true)}${![
            "overview",
            "knowledge",
            "reports",
            "sources",
          ].includes(view) &&
          window.OrbitalResearchViews.workflow(model)}${view === "pipeline" &&
          renderPipeline({ ...model })}${view === "decisions" &&
          renderDecisions({ ...model })}${view === "performance" &&
          renderPerformance({ ...model })}${view === "sources" &&
          window.OrbitalResearchViews.sources(model)}${view === "reports" &&
          window.OrbitalResearchViews.reports(model)}
          <footer class="page-footer">
            <span>ORBITAL · STRATEGY INTELLIGENCE WORKSPACE</span
            ><span
              >기사 근거 → 사업 아이디어 → 검토 초안 → 보고서 · 모든 초안은 편집
              가능합니다.</span
            >
          </footer>
        </main>
      </div>
      ${toast &&
      html`<div class="toast" role="status">
        ${CheckCircle2({ size: 16 })}${toast}
      </div>`}${renderDialogs({ ...model })}
    </div>`;
  }
  function renderDialogs({
    setView,
    busy,
    modal,
    setModal,
    signals,
    opportunities,
    assumptions,
    decisions,
    performances,
    save,
    promote,
    extractKeywords,
    ...extra
  }) {
    const custom = window.OrbitalResearchViews.modal({
      busy,
      modal,
      setModal,
      save,
      opportunities,
      ...extra,
    });
    return (
      modal &&
      html`<div
        class="modal-backdrop"
        ${attributes({
          onMouseDown: (e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          },
        })}
      >
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div class="modal-heading">
            <div>
              <span class="eyebrow">STRATEGY WORKSPACE</span>
              <h2 id="modal-title">
                ${{
                  signal: "신호 상세 · 사업영향",
                  opportunity: modal.data?.id
                    ? "검토 안건"
                    : "새로운 검토 안건",
                  decision: "의사결정 기록",
                  assumption: modal.data?.id ? "가정 수정" : "가정 등록",
                  actual: "실적 업데이트",
                }[modal.type] || custom?.title}
              </h2>
            </div>
            <button
              class="icon-btn"
              aria-label="닫기"
              ${attributes({ onClick: () => !busy && setModal(null) })}
            >
              ${X({ size: 20 })}
            </button>
          </div>
          ${custom?.body}${modal.type === "signal" &&
          renderSignalDetail({
            setView: setView,
            busy: busy,
            modal: modal,
            setModal: setModal,
            opportunities: opportunities,
            performances: performances,
            save: save,
            promote: promote,
            extractKeywords,
          })}${modal.type === "opportunity" &&
          renderOpportunityForm({
            data: modal.data,
            signals: signals,
            assumptions: assumptions.filter(
              (a) => a.opportunityId === modal.data?.id,
            ),
            decisions: decisions.filter(
              (d) => d.opportunityId === modal.data?.id,
            ),
            busy: busy,
            onSave: async (d) => {
              if (modal.data?.id)
                await save(
                  "records/" + modal.data.id,
                  { revision: modal.data.revision, data: d },
                  "PATCH",
                );
              else await save("records", { kind: "opportunity", data: d });
            },
            onDecision: () => {
              const opportunity = opportunities.find(
                (item) => item.id === modal.data?.id,
              );
              if (opportunity)
                setModal({ type: "decision", data: opportunity });
            },
            onDuplicate: async () => {
              await save("records", {
                kind: "opportunity",
                data: modal.data,
              });
            },
          })}${modal.type === "decision" &&
          renderDecisionForm({
            busy: busy,
            modal: modal,
            save: save,
          })}${modal.type === "assumption" &&
          renderAssumptionForm({
            busy: busy,
            modal: modal,
            opportunities: opportunities,
            save: save,
          })}${modal.type === "actual" &&
          renderActualForm({ busy: busy, modal: modal, save: save })}
        </section>
      </div>`
    );
  }
  // 판단 근거 입력
  function renderDecisionForm({ busy, modal, save }) {
    return html`<form
      class="editor-form"
      ${attributes({
        onSubmit: async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await save("decisions", {
            opportunityId: modal.data.id,
            revision: modal.data.revision,
            outcome: f.get("outcome"),
            rationale: f.get("rationale"),
            conditions: f.get("conditions"),
          });
        },
      })}
    >
      <div class="form-context">
        ${renderSectorChip({ id: modal.data.category })}<b
          >${modal.data.title}</b
        ><span
          >현재 단계:
          ${getStageName(modal.data.stage)}${modal.data.sample
            ? " · 검토 예시"
            : ""}</span
        >
      </div>
      <label
        >결정<select name="outcome" defaultValue="diligence">
          ${stages
            .filter((s) => s.id !== "watch")
            .map(
              (s) =>
                html`<option${attributes({ value: s.id })}>${s.name}</option>`,
            )}
        </select></label
      ><label
        >판단 근거 <span class="required">필수</span
        ><textarea
          name="rationale"
          required${attributes({ rows: 4 })}
          placeholder="고객 수요·기술·경제성 근거와 불확실성을 기록해 주세요."
        ></textarea></label
      ><label
        >후속 조건·다음 확인 사항<textarea
          name="conditions"
          ${attributes({ rows: 2 })}
          placeholder="예: 유료 PoC 고객 1곳 확보 후 투자 규모 재검토"
        ></textarea>
      </label>
      <div class="form-note">
        실증·추진 결정에는 근거 자료 연결이 필요합니다. 이 기록은 실제 투자
        집행을 수행하지 않습니다.
      </div>
      <div class="modal-actions">
        <button class="primary" ${attributes({ disabled: busy })}>
          ${busy
            ? Loader2({ size: 14, className: "spin" })
            : FileCheck2({ size: 14 })}${" "}결정
          기록 저장
        </button>
      </div>
    </form>`;
  }
  // 의사결정 기록
  function renderDecisions({ setModal, opportunities, decisions }) {
    return html`<div class="decision-layout">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>의사결정 로그</h2>
            <span class="tiny-tag">${decisions.length}</span>
          </div>
        </div>
        ${decisions.length
          ? html`<div class="decision-list">
              ${decisions.map(
                (d) =>
                  html`<article><div><span${attributes({ className: "decision-badge " + d.outcome })}>${d.autoDraft && d.outcome === "approved" ? "추진 제안" : getStageName(d.outcome)}${d.autoDraft ? " · 초안" : ""}</span><time>${formatDate(d.at, true)} KST</time></div><h3>${d.title}</h3><p>${d.rationale}</p>${d.conditions && html`<div class="conditions"><b>후속 조건</b> ${d.conditions}</div>`}<small>${getStageName(d.before)} → ${getStageName(d.outcome)} · 근거${" "}${d.evidenceIds?.length || 0}건</small>${d.autoDraft && html`<button class="secondary" ${attributes({ onClick: () => setModal({ type: "draft-decision", data: d }) })}>판단 초안 수정</button>`}</article>`,
              )}
            </div>`
          : renderEmptyState({
              children: html`저장된 의사결정이 없습니다.<span
                  >검토 안건에서 근거와 후속 조건을 입력해 결정해 보세요.</span
                >`,
            })}
      </section>
      <aside class="panel decision-aside">
        <h3>검토 중인 안건</h3>
        ${opportunities.map(
          (o) =>
            html`<button${attributes({ onClick: () => setModal({ type: "decision", data: o }) })}><span><b>${o.title}</b><small>${getStageName(o.stage)}${o.sample ? " · 검토 예시" : ""}</small></span>${ArrowRight({ size: 15 })}</button>`,
        )}
      </aside>
    </div>`;
  }
  // 뉴스·지식베이스
  function renderKnowledge({
    sector,
    setSector,
    query,
    setQuery,
    newsMode,
    setNewsMode,
    signals,
    filtered,
    counts,
    setModal,
  }) {
    return html`<div class="knowledge-tools"><div class="search-box">${Search({ size: 16 })}<input aria-label="뉴스 검색" placeholder="기업, 기술, 시장 또는 규제로 검색"${attributes({ value: query })}${attributes({ onChange: (e) => setQuery(e.target.value) })}>${query && html`<button${attributes({ onClick: () => setQuery("") })} aria-label="검색 초기화">${X({ size: 13 })}</button>`}</div><select aria-label="검증 상태 필터"${attributes({ value: newsMode })}${attributes({ onChange: (e) => setNewsMode(e.target.value) })}><option value="all">전체 자료</option><option value="news">뉴스만</option><option value="official">공식 출처</option><option value="verified">원문 확인 기록</option></select></div><div class="filter-row"><button${attributes({ className: sector === "all" ? "active" : "" })}${attributes({ onClick: () => setSector("all") })}>전체 <span>${signals.length}</span></button>${sectors.map((s) => html`<button${attributes({ className: sector === s.id ? "active" : "" })}${attributes({ onClick: () => setSector(s.id) })}><i${attributes({ style: { background: s.color } })}></i>${s.name} <span>${counts[s.id]}</span></button>`)}</div><div class="knowledge-layout"><section class="news-grid">${filtered.length ? filtered.map((s) => renderNewsCard({ signal: s, onOpen: (signal) => setModal({ type: "signal", data: signal }) })) : renderEmptyState({ children: html`검색 조건에 맞는 자료가 없습니다.` })}</section><aside class="panel knowledge-aside"><div class="eyebrow">CONNECTED KNOWLEDGE</div><h3>기업 · 기술 · 시장 · 규제</h3><p>뉴스 제목과 피드 설명에서 찾은 태그입니다. 관계와 관련성은 원문 확인이 필요합니다.</p>${[
      [
        "기업",
        ["Hanwha", "Qcells", "ICEYE", "GHGSat", "Planet", "NASA", "ESA"],
      ],
      ["기술", ["SAR", "InSAR", "AIS", "methane", "solar"]],
      ["규제·표준", ["FCC", "ITU", "3GPP", "spectrum"]],
    ].map(
      ([label, arr]) =>
        html`<div class="tag-group">
          <h4>${label}</h4>
          <div>
            ${arr.map(
              (t) =>
                html`<button${attributes({ onClick: () => setQuery(t) })}>${t}<small>${
                  signals.filter((s) =>
                    (s.title + " " + s.summary)
                      .toLowerCase()
                      .includes(t.toLowerCase()),
                  ).length
                }</small></button>`,
            )}
          </div>
        </div>`,
    )}<div class="method-note">${ShieldCheck({ size: 16 })}<span>공식 출처라도 보도 내용의 실현 여부·성과·금액은 추가 확인해야 합니다.</span></div></aside></div>`;
  }
  // 검토 안건 입력
  function renderOpportunityForm({
    data = {},
    signals,
    assumptions = [],
    decisions = [],
    busy,
    onSave,
    onDecision,
    onDuplicate,
  }) {
    const [scores, setScores] = window.OrbitalApp.draftState(
      data.scores || DEFAULT_SCORES,
    );
    const [evidence, setEvidence] = window.OrbitalApp.draftState(
      data.evidenceIds || [],
    );
    return html`<form
      class="editor-form"
      ${attributes({
        onSubmit: (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            ...Object.fromEntries(f.entries()),
            scores,
            evidenceIds: evidence,
            manualStage: f.get("manualStage") === "on",
          });
        },
      })}
    >
      ${data.autoDraft &&
      html`<div class="form-note auto-draft-note">
        <b
          >${data.userEdited
            ? "사용자 수정 반영"
            : "기사에서 생성된 검토 초안"}</b
        >
        <p>
          ${data.generationMethod} · 근거 ${data.evidenceIds?.length || 0}건
        </p>
        <small
          >점수는 기사 빈도·출처 다양성·기술 및 계약 언급으로 산정한 초기
          가설입니다. 고객 수요와 수익은 검증 전입니다.</small
        >
      </div>`}${data.sample &&
      html`<div class="form-note">
        검토 방식 설명을 위한 예시 안건입니다. 점수는 예시이며 실사나 투자
        권고가 아닙니다.<button
          class="text-btn"
          type="button"
          ${attributes({ onClick: onDuplicate })}
        >
          나의 실제 검토안건으로 복제 ${ArrowUpRight({ size: 12 })}
        </button>
      </div>`}${data.id &&
      html`<div class="feedback-box">
        <h4>검토·실적 피드백</h4>
        <p>
          현재 단계 ${getStageName(data.stage)} · 결정 기록
          ${decisions.length}건 · 가정 ${assumptions.length}건
        </p>
        ${assumptions.map(
          (a) =>
            html`<div>
              <span>${a.title}</span
              ><b
                >목표 ${a.target}${a.unit} /
                실적${" "}${a.actual === null
                  ? "미확인"
                  : String(a.actual) + a.unit}</b
              >
            </div>`,
        )}
      </div>`}<label
        >안건명<input
          name="title"
          required${attributes({ defaultValue: data.title })}
          placeholder="예: SAR·AIS 기반 해양 정보 구독 서비스"
      /></label>
      <div class="form-row">
        <label
          >분야<select
            name="category"
            ${attributes({ defaultValue: data.category || "maritime" })}
          >
            ${sectors.map(
              (s) =>
                html`<option${attributes({ value: s.id })}>${s.name}</option>`,
            )}
          </select></label
        ><label
          >담당<input
            name="owner"
            ${attributes({ defaultValue: data.owner })}
            placeholder="담당자·사업부"
        /></label>
      </div>
      <label
        >사업 가설<textarea
          name="thesis"
          required${attributes({ rows: 3 })}${attributes({
            defaultValue: data.thesis,
          })}
          placeholder="누구의 어떤 문제를 해결하고, 왜 한화가 추진할 수 있는지 적어 주세요."
        ></textarea>
      </label>
      ${data.autoDraft &&
      html`<label
          >해결할 문제<textarea
            name="problem"
            rows="3"
            ${attributes({ value: data.problem })}
          ></textarea></label
        ><label
          >대상 고객<input
            name="customer"
            ${attributes({ value: data.customer })} /></label
        ><label
          >제공할 해결책<textarea
            name="solution"
            rows="3"
            ${attributes({ value: data.solution })}
          ></textarea></label
        ><label
          >수익모델 가설<input
            name="revenueModel"
            ${attributes({ value: data.revenueModel })} /></label
        ><label
          >위험과 확인사항<textarea
            name="risks"
            rows="3"
            ${attributes({ value: data.risks })}
          ></textarea>
        </label>
        <div class="form-row">
          <label
            >단계 수동 지정<input
              type="checkbox"
              name="manualStage"
              ${attributes({ checked: data.manualStage })}
            />수동 지정 시 점수에 따른 이동을 고정합니다.</label
          ><label
            >단계<select name="stage" ${attributes({ value: data.stage })}>
              ${stages.map(
                (stage) =>
                  html`<option value="${stage.id}">
                    ${stage.id === "approved" ? "추진 제안" : stage.name}
                  </option>`,
              )}
            </select></label
          >
        </div>`}
      <div class="scoring-box">
        <div>
          <h4>사업성 검토 점수</h4>
          ${renderInvestmentScore({ scores: scores })}
        </div>
        ${SCORE_CRITERIA.map(
          ({ id: key, label: name, weight }) =>
            html`<label><span>${name}<small>${Math.round(weight * 100)}%</small></span><input${attributes({ "aria-label": name })} type="range"${attributes({ min: 1 })}${attributes({ max: 5 })}${attributes({ step: 1 })}${attributes({ value: scores[key] })}${attributes({ onChange: (e) => setScores({ ...scores, [key]: Number(e.target.value) }) })}><b>${scores[key]} / 5</b></label>`,
        )}
      </div>
      ${data.autoDraft &&
      html`<details class="scoring-reasons">
        <summary>자동 점수의 산식·기사 근거 보기</summary>
        ${SCORE_CRITERIA.map(
          ({ id, label }) =>
            html`<p>
              <b>${label} · ${scores[id]} / 5</b><br />${data.scoreReasons?.[
                id
              ] || "사용자 직접 평가"}
            </p>`,
        )}
        <p>
          ${(data.gateTrace || [])
            .map(
              (gate) =>
                `${getStageName(gate.stage)} ${gate.threshold}점 이상: ${gate.passed ? "통과" : "미달"}`,
            )
            .join(" · ")}
        </p>
      </details>`}
      <div class="form-row">
        <label
          >검토 투자액 (억 원)<input
            name="amount"
            type="number"
            ${attributes({ min: 0 })}
            step="any"
            ${attributes({ defaultValue: data.amount ?? "" })}
            placeholder="미확정이면 비워 두세요" /></label
        ><label
          >다음 검증 단계<input
            name="nextStep"
            ${attributes({ defaultValue: data.nextStep })}
            placeholder="고객 인터뷰·PoC·원가 확인"
        /></label>
      </div>
      <div class="evidence-select">
        <h4>근거 자료 연결 <small>${evidence.length}건 선택</small></h4>
        <div>
          ${[
            ...signals.filter((signal) => evidence.includes(signal.id)),
            ...signals.filter((signal) => !evidence.includes(signal.id)),
          ]
            .slice(0, 200)
            .map(
              (s) =>
                html`<label
                  ><input
                    type="checkbox"
                    ${attributes({
                      checked: evidence.includes(s.id),
                    })}${attributes({
                      onChange: (e) =>
                        setEvidence(
                          e.target.checked
                            ? [...evidence, s.id]
                            : evidence.filter((id) => id !== s.id),
                        ),
                    })}
                  /><span
                    >${s.title}<small
                      >${s.source} ·
                      ${s.reviewed ? "원문 확인 기록" : s.verification}</small
                    ></span
                  ></label
                >`,
            )}
        </div>
      </div>
      <div class="modal-actions">
        ${data.id &&
        html`<button
          class="secondary"
          type="button"
          ${attributes({ disabled: busy })}${attributes({
            onClick: onDecision,
          })}
        >
          의사결정 기록 ${ArrowRight({ size: 14 })}
        </button>`}<button class="primary" ${attributes({ disabled: busy })}>
          ${busy
            ? Loader2({ size: 14, className: "spin" })
            : Check({ size: 14 })}${" "}${data.id
            ? "검토 내용 저장"
            : "안건 등록"}
        </button>
      </div>
    </form>`;
  }
  // 글로벌 인사이트
  function renderOverview({
    setView,
    sector,
    setSector,
    selectedCountry,
    setSelectedCountry,
    state,
    loading,
    setModal,
    signals,
    opportunities,
    filtered,
    counts,
    schedule,
    official,
    realOpps,
    amounts,
    amount,
    progressCount,
    refresh,
  }) {
    return html`<div class="kpis">
        <div>
          <span>수집된 정보${Radio({ size: 15 })}</span
          ><b
            >${loading ? "—" : signals.length.toLocaleString()}<small
              >건</small
            ></b
          >
          <p>
            뉴스 ${signals.filter((s) => s.kind === "news").length} ·
            기초자료${" "}${signals.filter((s) => s.kind === "reference")
              .length}
          </p>
        </div>
        <div>
          <span>공식 출처 정보${ShieldCheck({ size: 15 })}</span
          ><b>${loading ? "—" : official}<small>건</small></b>
          <p>공식 출처와 사실 검증은 별도</p>
        </div>
        <div>
          <span>나의 검토 안건${Layers3({ size: 15 })}</span
          ><b>${realOpps.length}<small>건</small></b>
          <p>
            별도 검토 예시 ${opportunities.filter((o) => o.sample).length}건
            제공
          </p>
        </div>
        <div>
          <span>검토 투자액${TrendingUp({ size: 15 })}</span
          ><b
            >${amounts.length ? amount.toLocaleString() : "—"}<small
              >${amounts.length ? "억 원" : "미입력"}</small
            ></b
          >
          <p>직접 등록한 안건의 검토액 합계</p>
        </div>
      </div>
      <section class="overview-grid">
        <div class="panel globe-panel">
          <div class="panel-header">
            <div>
              <i class="green-dot"></i>
              <h2>글로벌 기회 지도</h2>
              <span class="tiny-tag">6 SECTORS</span>
            </div>
            <button
              class="text-btn"
              ${attributes({
                onClick: () => {
                  setSector("all");
                  setSelectedCountry(null);
                },
              })}
            >
              전체 보기 ${ArrowUpRight({ size: 13 })}
            </button>
          </div>
          ${renderGlobePlaceholder({
            selected: sector,
            onSelect: setSector,
            counts: counts,
            selectedCountry: selectedCountry,
            onCountrySelect: setSelectedCountry,
          })}
          <div class="globe-sector-tabs">
            ${sectors.map((s) => {
              const I = icons[s.id];
              return html`<button${attributes({ className: sector === s.id ? "selected" : "" })}${attributes({ onClick: () => setSector(sector === s.id ? "all" : s.id) })}${attributes({ style: { "--sector-color": s.color } })}>${I({ size: 14 })}<span>${s.name}</span></button>`;
            })}
          </div>
          <div class="map-intelligence">
            <span class="map-square">${Activity({ size: 17 })}</span>
            <div>
              <small
                >${sector === "all"
                  ? "STRATEGIC QUESTION"
                  : sectorOf(sector).affiliate}</small
              >
              <p>
                ${sector === "all"
                  ? "어떤 관측 정보가 고객의 비용·시간·위험을 줄이는가?"
                  : sectorOf(sector).question}
              </p>
            </div>
            <button
              aria-label="선택 분야 정보 보기"
              ${attributes({ onClick: () => setView("knowledge") })}
            >
              ${ArrowRight({ size: 17 })}
            </button>
          </div>
        </div>
        <div class="panel signals-panel">
          <div class="panel-header">
            <div>
              <h2>최근 수집 신호</h2>
              <span class="live-label">FEED</span>
            </div>
            <button
              class="text-btn"
              ${attributes({ onClick: () => setView("knowledge") })}
            >
              모두 보기 ${ArrowUpRight({ size: 13 })}
            </button>
          </div>
          <div class="signal-feed">
            ${loading
              ? renderEmptyState({
                  children: html`${Loader2({
                    size: 18,
                    className: "spin",
                  })}정보를
                  불러오는 중입니다.`,
                })
              : filtered.length
                ? filtered.slice(0, 5).map((s) =>
                    renderNewsCard({
                      signal: s,
                      compact: true,
                      onOpen: (signal) =>
                        setModal({ type: "signal", data: signal }),
                    }),
                  )
                : renderEmptyState({
                    children: html`해당 분야에 수집된 뉴스가 없습니다.<button
                        class="text-btn"
                        ${attributes({ onClick: refresh })}
                      >
                        지금 수집하기
                      </button>`,
                  })}
          </div>
          <div class="feed-bottom">
            ${Clock({ size: 11 })}${schedule?.enabled
              ? "1시간마다 피드 확인 · 새 기사가 없을 수 있습니다."
              : "자동 갱신 설정 전 · 지금 수집으로 실행 가능"}
          </div>
        </div>
      </section>
      <section class="panel flow-panel">
        <div class="panel-header">
          <div>
            <h2>전략 의사결정 흐름</h2>
            <span class="muted">SIGNAL → DECISION → LEARNING</span>
          </div>
          <span class="muted">입력한 내용은 이 PC에 저장됩니다.</span>
        </div>
        <div class="process-flow">
          ${[
            { id: "collect", label: "글로벌 수집", to: "sources" },
            { id: "verify", label: "분류·검증", to: "knowledge" },
            { id: "knowledge", label: "지식베이스", to: "knowledge" },
            { id: "analysis", label: "사업영향·기회", to: "pipeline" },
            { id: "review", label: "투자검토", to: "pipeline" },
            { id: "decide", label: "의사결정", to: "decisions" },
            { id: "feedback", label: "가정·실적", to: "performance" },
          ].map(
            (p, i) =>
              html`<button${attributes({ onClick: () => setView(p.to) })}><span class="flow-number">0${i + 1}</span><b>${p.label}</b><span class="flow-count">${progressCount(p.id)}<small>건</small></span>${i < 6 && ChevronRight({ className: "flow-arrow", size: 13 })}</button>`,
          )}
        </div>
      </section>
      <div class="bottom-overview">
        <section class="panel">
          <div class="panel-header">
            <div><h2>검토를 기다리는 기회</h2></div>
            <button
              class="text-btn"
              ${attributes({ onClick: () => setView("pipeline") })}
            >
              검토 보드 ${ArrowUpRight({ size: 13 })}
            </button>
          </div>
          <div class="opportunity-list">
            ${opportunities
              .slice(0, 3)
              .map(
                (o) =>
                  html`<button${attributes({ onClick: () => setModal({ type: "opportunity", data: o }) })}><div class="opportunity-number"${attributes({ style: { color: sectorOf(o.category).color } })}>${investmentScore(o.scores)}</div><div><b>${o.title}</b><span>${sectorOf(o.category).name} ·${" "}${o.sample ? "검토 예시" : o.owner} · ${getStageName(o.stage)}</span></div>${ChevronRight({ size: 15 })}</button>`,
              )}${!opportunities.length &&
            renderEmptyState({
              children: html`새로운 사업 기회를 등록해 주세요.`,
            })}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div><h2>최근 활동</h2></div>
            ${History({ size: 15, className: "muted" })}
          </div>
          <div class="activity-list">
            ${(state?.audit || []).slice(0, 3).map(
              (a) =>
                html`<div>
                  <i></i>
                  <div>
                    <strong>${a.action}</strong>
                    <p>${a.detail}</p>
                    <span>${formatDate(a.at, true)} KST</span>
                  </div>
                </div>`,
            )}${!state?.audit?.length &&
            html`<div class="quiet-empty">
              새 정보 수집과 검토·결정 이력이 이곳에 쌓입니다.
            </div>`}
          </div>
        </section>
      </div>`;
  }
  function renderPageHeading({ view, refreshing, setModal, lastRun, refresh }) {
    return html`<div
      class="page-heading"
      ${attributes({
        className: view === "overview" ? "home-page-heading" : "",
      })}
    >
      <div>
        <div class="eyebrow">INTELLIGENCE TO OPPORTUNITY</div>
        <h1>
          ${view === "overview"
            ? "글로벌 인사이트"
            : {
                knowledge: "관련 기사·지식베이스",
                pipeline: "사업·투자 검토",
                decisions: "의사결정 기록",
                performance: "가정·실적 관리",
                sources: "수집·업데이트",
                reports: "최종보고서",
              }[view]}
        </h1>
        ${view === "overview"
          ? null
          : html`<p>
              ${{
                knowledge:
                  "출처·검증 상태·기업·기술을 연결한 전략 정보 라이브러리",
                pipeline:
                  "기회 발굴 → 투자검토 → 실증 → 결정 · 점수는 내부 검토용 기준입니다.",
                decisions:
                  "추진·보류·종료와 판단 근거를 기록하고 검토 이력을 추적합니다.",
                performance:
                  "목표와 실제 값을 연결해 다음 검토의 근거로 활용합니다.",
                sources:
                  "공식 RSS와 분야별 뉴스 검색 피드를 수집하고, 중복 제거·분류 후 저장합니다.",
                reports:
                  "선택한 기사의 근거와 아이디어, 예산을 결재용 보고안으로 정리합니다.",
              }[view]}
            </p>`}
      </div>
      <div class="heading-actions">
        ${view === "pipeline"
          ? html`<button
              class="primary"
              ${attributes({
                onClick: () =>
                  setModal({
                    type: "opportunity",
                    data: {
                      scores: { fit: 3, demand: 3, economics: 3, moat: 3 },
                    },
                  }),
              })}
            >
              ${Plus({ size: 15 })} 검토 안건 등록
            </button>`
          : view === "performance"
            ? html`<button
                class="primary"
                ${attributes({
                  onClick: () => setModal({ type: "assumption" }),
                })}
              >
                ${Plus({ size: 15 })} 가정 등록
              </button>`
            : html`<button
                class="secondary"
                ${attributes({ onClick: refresh })}${attributes({
                  disabled: refreshing,
                })}
              >
                ${refreshing
                  ? Loader2({ size: 14, className: "spin" })
                  : RefreshCw({ size: 14 })}${" "}${refreshing
                  ? "정보 수집 중"
                  : "지금 수집"}
              </button>`}<span class="seoul-time"
          >${lastRun?.finished_at
            ? "수집 " + formatDate(lastRun.finished_at, true) + " KST"
            : "원문 기반 · 사실 확인 필요"}</span
        >
      </div>
    </div>`;
  }
  // 가정·실적 관리
  function renderPerformance({
    setModal,
    opportunities,
    assumptions,
    performances,
  }) {
    return html`<div class="performance-summary">
        <div><span>등록된 가정</span><b>${assumptions.length}</b></div>
        <div>
          <span>실적 확인</span
          ><b>${assumptions.filter((a) => a.actual !== null).length}</b>
        </div>
        <div><span>실적 이력</span><b>${performances.length}</b></div>
      </div>
      <div class="assumption-grid">
        ${assumptions.map((a) => {
          const reached =
            a.actual !== null &&
            (a.direction === "lower"
              ? a.actual <= a.target
              : a.actual >= a.target);
          return html`<article class="panel assumption-card"><div class="assumption-top"><span${attributes(
            {
              className:
                "status-tag " +
                (a.actual === null ? "" : reached ? "good" : "warning"),
            },
          )}>${
            a.actual === null
              ? "검증 대기"
              : reached
                ? "목표 충족"
                : "차이 확인 필요"
          }</span><span>${a.dueDate || "기한 미지정"}</span></div><h3>${a.title}</h3><p>${
            opportunities.find((o) => o.id === a.opportunityId)?.title ||
            "관련 안건"
          }</p><div class="target-actual"><div><span>가정·목표</span><b>${a.target}<small>${a.unit}</small></b></div>${ArrowRight({ size: 17 })}<div><span>최근 실적</span><b>${a.actual === null ? "—" : a.actual}<small>${a.unit}</small></b></div></div><div class="variance">${
            a.actual === null
              ? "실적을 등록하면 목표와의 차이가 표시됩니다."
              : `목표 대비 ${a.actual - a.target > 0 ? "+" : ""}${Math.round((a.actual - a.target) * 100) / 100} ${a.unit === "%" ? "%p" : a.unit} · ${a.direction === "lower" ? "낮을수록 유리" : "높을수록 유리"}`
          }</div><div class="assumption-actions"><button class="secondary"${attributes({ onClick: () => setModal({ type: "assumption", data: a }) })}>가정 수정</button><button class="primary"${attributes({ onClick: () => setModal({ type: "actual", data: a }) })}>실적 등록 ${Plus({ size: 12 })}</button></div></article>`;
        })}${!assumptions.length &&
        html`<div class="panel full">
          ${renderEmptyState({
            children: html`가정을 등록해 검증을 시작하세요.<span
                >예: 예측 오차율 목표, 고객 인터뷰 전환율, 데이터 조달
                단가</span
              ><button
                class="primary"
                ${attributes({
                  onClick: () => setModal({ type: "assumption" }),
                })}
              >
                ${Plus({ size: 14 })} 첫 가정 등록
              </button>`,
          })}
        </div>`}
      </div>
      ${performances.length > 0 &&
      html`<section class="panel performance-history">
        <div class="panel-header"><h2>실적 업데이트 이력</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>가정</th>
                <th>목표</th>
                <th>실적</th>
                <th>기준일</th>
                <th>확인 근거</th>
              </tr>
            </thead>
            <tbody>
              ${performances.map(
                (p) =>
                  html`<tr>
                    <td>${p.title}</td>
                    <td>${p.target}${p.unit}</td>
                    <td>${p.value}${p.unit}</td>
                    <td>${p.asOf}</td>
                    <td>
                      ${p.note}${p.sourceUrl &&
                      html`<a${attributes({ href: p.sourceUrl })} target="_blank" rel="noopener noreferrer">${ExternalLink({ size: 12 })}</a>`}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
      </section>`}`;
  }
  // 사업·투자 검토
  function renderPipeline({ setModal, opportunities }) {
    return html`<div class="method-banner">
        ${SlidersHorizontal({ size: 16 })}
        <div>
          내부 평가 점수 = 사업 적합도 30% + 고객 수요 25% + 수익성 25% + 차별성
          20%<small
            >기사 기반으로 자동 평가하고 점수 기준에 따라 단계를 제안합니다.
            안건을 클릭해 점수·사업 내용·단계를 수정할 수 있습니다.</small
          >
        </div>
      </div>
      <div class="pipeline-board">
        ${stages.map(
          (stage) =>
            html`<section class="board-column"><div class="column-title"><i${attributes({ className: "stage-dot " + stage.id })}></i><h3>${stage.id === "approved" ? "추진 제안·결정" : stage.name}</h3><span>${opportunities.filter((o) => o.stage === stage.id).length}</span></div>${opportunities
              .filter((o) => o.stage === stage.id)
              .map(
                (o) =>
                  html`<button
                    class="opportunity-card"
                    ${attributes({
                      onClick: () => setModal({ type: "opportunity", data: o }),
                    })}
                  >
                    <div class="card-badges">
                      ${renderSectorChip({ id: o.category })}${o.autoDraft &&
                      html`<span class="draft-tag"
                        >${o.userEdited ? "수정됨" : "자동 초안"}</span
                      >`}${o.sample &&
                      html`<span class="sample-tag">예시</span>`}
                    </div>
                    <h3>${o.title}</h3>
                    <p>${o.thesis}</p>
                    <div class="opportunity-card-bottom">
                      ${renderInvestmentScore({ scores: o.scores })}<span
                        >${o.autoDraft && o.budget
                          ? `PoC ${Math.round(o.budget.total / 10000).toLocaleString()}만 원`
                          : o.amount !== null
                            ? Number(o.amount).toLocaleString() + "억 원"
                            : "투자액 미입력"}</span
                      >
                    </div>
                    <div class="card-owner">
                      <span>${o.owner}</span
                      ><span>근거 ${o.evidenceIds?.length || 0}건</span>
                    </div>
                  </button>`,
              )}${!opportunities.some((o) => o.stage === stage.id) && html`<div class="column-empty">등록된 안건 없음</div>`}</section>`,
        )}
      </div>`;
  }
  function renderEmptyState({ children }) {
    return html`<div class="empty">
      <div>${Orbit({ size: 25 })}</div>
      ${children}
    </div>`;
  }
  function renderSectorChip({ id }) {
    const s = sectorOf(id);
    return html`<span class="sector-chip"${attributes({ style: { color: s.color, background: s.color + "12" } })}><i${attributes({ style: { background: s.color } })}></i>${s.name}</span>`;
  }
  function renderInvestmentScore({ scores }) {
    return html`<span class="score-num"
      >${investmentScore(scores)}<small>/100</small></span
    >`;
  }
  function renderNewsCard({ signal: s, compact = false, onOpen }) {
    const googleNews = s.url?.includes("news.google.com");
    const analysisLabel = s.articleAnalysis
      ? s.articleAnalysis.analysisBasis === "google-news-headline"
        ? "Google News 제목 분석"
        : "AI 요약 완료"
      : {
          "body-ready":
            "Python 기사 본문 확보 완료 · 한국어 요약 대기 중입니다.",
          pending: googleNews ? "Google News 분석 대기" : "AI 요약 대기",
          running: googleNews ? "Google News 분석 중" : "AI 요약 중",
          failed: googleNews ? "Google News 분석 실패" : "원문 수집·요약 실패",
        }[s.articleJob?.status] ||
        (googleNews ? "Google News 제목" : "원문 제목");
    return html`<button${attributes({ className: "news-card " + (compact ? "compact" : "") })}${attributes({ onClick: () => onOpen(s) })}><div class="news-card-top">${renderSectorChip({ id: s.category })}<span${attributes({ className: "source-status " + (s.reviewed ? "verified" : "") })}>${s.reviewed ? Check({ size: 10 }) : s.official ? ShieldCheck({ size: 10 }) : null}${s.reviewed ? "원문 확인 기록" : s.official ? "공식 출처" : "미검증"}</span><span class="news-formatDate">${s.kind === "reference" ? "기초 자료" : formatDate(s.publishedAt)}</span></div><h3>${s.title}</h3><div class="news-meta"><span>${s.source}</span><span>${s.kind === "reference" ? "서비스·기술 소개" : analysisLabel}${" "}${ArrowUpRight({ size: 11 })}</span></div></button>`;
  }
  function renderSidebar({
    view,
    setView,
    sector,
    setSector,
    signals,
    counts,
    lastRun,
    schedule,
    switchView,
  }) {
    return html`<aside class="sidebar"><a class="brand" href="#"${attributes({
      onClick: (e) => {
        e.preventDefault();
        switchView("overview");
      },
    })}><span class="brand-icon">${Orbit({ size: 25 })}</span><span>ORBITAL<span class="brand-dot">.</span><small>FUTURE STRATEGY</small></span></a><div class="workspace-label">STRATEGY WORKSPACE</div><nav>${navs.map((n) => html`<button${attributes({ className: view === n.id ? "active" : "" })}${attributes({ onClick: () => switchView(n.id), "aria-label": n.name, title: n.name })}>${n.icon({ size: 17 })}<span>${n.name}</span>${n.id === "knowledge" && signals.length > 0 && html`<em>${signals.length}</em>`}</button>`)}</nav><div class="sidebar-rule"></div><div class="workspace-label">WATCHLIST / 관심 분야</div><div class="sector-nav">${sectors.map(
      (s) =>
        html`<button${attributes({
          onClick: () => {
            setSector(sector === s.id ? "all" : s.id);
            if (view !== "overview" && view !== "knowledge")
              setView("knowledge");
          },
        })}${attributes({ className: sector === s.id ? "selected" : "" })}><i${attributes({ style: { background: s.color } })}></i>${s.name}<span>${counts[s.id] || "—"}</span></button>`,
    )}</div><div class="sidebar-bottom"><div class="connection"><i${attributes({ className: schedule?.enabled ? "green-dot" : "amber-dot" })}></i><span>${schedule?.enabled ? "1시간 자동 갱신" : "로컬 데이터 관리"}<small>${
      lastRun?.finished_at
        ? "최근 수집 " + formatDate(lastRun.finished_at, true)
        : "아직 수집 이력 없음"
    }</small></span></div><button${attributes({ onClick: () => setView("sources") })}>${Settings2({ size: 14 })} 수집 상태 확인 ${ChevronRight({ size: 13 })}</button></div></aside>`;
  }
  function renderSignalDetail({
    setView,
    busy,
    modal,
    setModal,
    opportunities,
    performances,
    save,
    promote,
    extractKeywords,
  }) {
    const googleNews = modal.data.url?.includes("news.google.com");
    const bodyText =
      modal.data.articleContent?.fullText ||
      modal.data.articleAnalysis?.fullText;
    const fullBodySummary =
      modal.data.articleAnalysis?.analysisBasis === "article-body";
    const headlineAnalysis =
      modal.data.articleAnalysis?.analysisBasis === "google-news-headline";
    const rssExcerpt =
      modal.data.articleAnalysis?.analysisBasis === "rss-excerpt";
    return html`<div class="signal-detail">
      <div class="detail-badges">
        ${renderSectorChip({ id: modal.data.category })}<span class="status-tag"
          >${modal.data.verification}</span
        >
      </div>
      <h2>${modal.data.title}</h2>
      <div class="detail-source">
        ${googleNews ? "Google News · " : ""}${modal.data.source} · 발행
        ${formatDate(modal.data.publishedAt, true)}<br />수집
        ${formatDate(modal.data.collectedAt, true)} KST
      </div>
      <a
        class="primary source-original"
        ${attributes({
          href:
            modal.data.articleContent?.resolvedUrl ||
            modal.data.articleAnalysis?.resolvedUrl ||
            modal.data.url,
        })}
        target="_blank"
        rel="noopener noreferrer"
        >${"기사 원문 열기"} ${ArrowUpRight({ size: 14 })}</a
      >
      <div class="detail-block">
        <h4>
          ${modal.data.articleAnalysis
            ? headlineAnalysis
              ? "한국어 요약 · Google News 제목 기반"
              : rssExcerpt
                ? "한국어 요약 · RSS 발췌 기반"
                : "한국어 기사 요약"
            : googleNews
              ? "Google News 피드 · 분석 전"
              : "피드 설명 · AI 요약 전"}
        </h4>
        <p>
          ${(fullBodySummary ? modal.data.articleAnalysis?.summary : null) ||
          "한국어 요약을 자동으로 준비하고 있습니다. 서버의 처리 상태가 아래에 표시됩니다."}
        </p>
      </div>
      <div class="detail-block analysis-block">
        <h4>
          ${googleNews ? "Python 원문 수집·요약" : "Python 원문 수집·요약"} ·
          GPT-6 Luna / Low
        </h4>
        <p>
          ${{
            "body-ready":
              "Python 기사 본문 확보 완료 · 한국어 요약 대기 중입니다.",
            pending: googleNews
              ? "Python 수집기로 원문 주소와 기사 본문을 확보할 차례를 기다리고 있습니다."
              : "서버에서 자동 분석을 기다리는 중입니다.",
            running: googleNews
              ? "Python으로 기사 본문을 추출하고 본문 전체를 한국어로 요약하고 있습니다."
              : "서버가 원문을 수집하고 AI로 요약하는 중입니다.",
            completed: headlineAnalysis
              ? "Google News 제목·매체 정보를 분석했습니다. Google News 피드에는 기사 본문이 없어 세부 내용은 확인할 수 없습니다."
              : rssExcerpt
                ? "RSS에서 제공된 발췌문을 한국어로 요약해 DB에 저장했습니다."
                : "원문 자동 수집과 AI 요약이 완료되어 DB에 저장됐습니다.",
            failed:
              "자동 분석 실패: " +
              (modal.data.articleJob?.error || "원문 접근을 확인해 주세요."),
          }[modal.data.articleJob?.status] ||
          (googleNews
            ? "원문 링크를 확인하고 Python으로 공개 기사 본문을 추출해 요약합니다."
            : "뉴스 수집 시 서버가 원문을 자동 수집하고 요약합니다.")}
        </p>
        <button
          class="primary"
          ${attributes({
            disabled:
              busy ||
              ["pending", "running"].includes(modal.data.articleJob?.status),
            onClick: () => extractKeywords(modal.data.id),
          })}
        >
          ${modal.data.articleJob?.status === "failed"
            ? googleNews
              ? "본문 수집·요약 재시도"
              : "원문 수집·요약 재시도"
            : googleNews
              ? "본문 수집·요약 다시 실행"
              : "원문 수집·요약 다시 실행"}
        </button>
        ${modal.data.articleAnalysis &&
        html`<div class="entity-tags">
            ${modal.data.articleAnalysis.keywords.map(
              (keyword) => html`<span>${keyword}</span>`,
            )}
          </div>
          <p class="muted">
            ${modal.data.articleAnalysis.model} ·
            ${modal.data.articleAnalysis.effort} ·
            ${formatDate(modal.data.articleAnalysis.analyzedAt, true)}
          </p>
          ${bodyText &&
          html`<details>
            <summary>
              ${headlineAnalysis
                ? "분석에 사용한 Google News 정보 보기"
                : "수집한 원문 본문 보기"}
            </summary>
            <p style="white-space:pre-wrap">${bodyText}</p>
          </details>`}`}
      </div>
      <div class="detail-block analysis-block">
        <span class="analysis-label">검토용 사업 가설 · 규칙 기반</span>
        <h4>${sectorOf(modal.data.category).question}</h4>
        <p>${modal.data.implication}</p>
        <span class="affiliate"
          >한화 사업 접점(제안): ${modal.data.affiliate}</span
        >
      </div>
      <div class="detail-block uncertainty-block">
        ${AlertCircle({ size: 15 })}
        <p>${modal.data.uncertainty}</p>
      </div>
      <div class="entity-tags">
        ${(modal.data.entities || []).map((t) => html`<span>${t}</span>`)}
      </div>
      ${opportunities.some((o) => o.evidenceIds?.includes(modal.data.id)) &&
      html`<div class="feedback-box">
        <h4>지식베이스로 돌아온 검토·실적</h4>
        ${opportunities
          .filter((o) => o.evidenceIds?.includes(modal.data.id))
          .map(
            (o) =>
              html`<div>
                <span>${o.title}</span
                ><b
                  >${getStageName(o.stage)} ·
                  실적${" "}${performances.filter(
                    (p) => p.opportunityId === o.id,
                  ).length}건</b
                >
              </div>`,
          )}<button
          class="text-btn"
          ${attributes({
            onClick: () => {
              setModal(null);
              setView("performance");
            },
          })}
        >
          가정·실적 관리로 이동 ${ArrowRight({ size: 12 })}
        </button>
      </div>`}
      <form
        class="verification-form"
        ${attributes({
          onSubmit: async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await save("verify", {
              id: modal.data.id,
              note: f.get("note"),
            });
          },
        })}
      >
        <h4>원문 확인 기록</h4>
        ${modal.data.reviewed &&
        html`<p class="muted">
          기록된 확인 내용: ${modal.data.reviewNote}
        </p>`}<textarea
          name="note"
          required
          placeholder="확인한 사실과 아직 확인되지 않은 내용을 적어 주세요."
          ${attributes({ rows: 2 })}
        ></textarea
        ><button class="secondary" ${attributes({ disabled: busy })}>
          ${ShieldCheck({ size: 13 })} 원문 확인 기록 저장
        </button>
      </form>
      <div class="modal-actions">
        <button
          class="primary"
          ${attributes({ onClick: () => promote(modal.data) })}
        >
          이 신호로 투자검토 안건 만들기 ${ArrowRight({ size: 14 })}
        </button>
      </div>
    </div>`;
  }
  // 뉴스 수집 상태
  function renderSources({ state, refreshing, lastRun, schedule, refresh }) {
    return html`<div class="sources-top"><section class="panel schedule-card"><span class="eyebrow">HOURLY INTELLIGENCE</span><h2>${
      schedule?.enabled
        ? "매시간 새 신호를 확인합니다."
        : "공개 피드의 수집 상태를 확인합니다."
    }</h2><p>수동 수집을 누르면 서버가 NASA·ESA 공식 RSS와 6개 분야의 Google News RSS를 실시간으로 조회합니다. 기존 기사는 중복 저장하지 않고 최근 검색 결과로 갱신합니다.</p><div><span${attributes({ className: schedule?.enabled ? "schedule-enabled" : "schedule-pending" })}><i${attributes({ className: schedule?.enabled ? "green-dot" : "amber-dot" })}></i>${
      schedule?.enabled ? "자동화 활성 · 1시간 단위" : "자동화 연결 전"
    }</span><span>기준 시간대 Asia/Seoul</span></div></section><section class="panel refresh-card">${Database({ size: 28 })}<b>${
      lastRun
        ? lastRun.status === "success"
          ? "정상"
          : lastRun.status === "partial"
            ? "일부 연결 확인"
            : lastRun.status === "running"
              ? "수집 중"
              : "수집 실패"
        : "미실행"
    }</b><span>최근 수집${" "}${
      lastRun?.finished_at
        ? formatDate(lastRun.finished_at, true) + " KST"
        : "기록 없음"
    }</span><button class="secondary"${attributes({ onClick: refresh })}${attributes({ disabled: refreshing })}>${refreshing ? Loader2({ className: "spin", size: 14 }) : RefreshCw({ size: 14 })}${" "}수동 수집 실행</button></section></div><div class="sources-grid">${(
      state?.sources || []
    ).map((s) => {
      const result = lastRun?.details?.find((d) => d.id === s.id);
      return html`<div class="panel source-card"><div><span${attributes({ className: "source-icon " + (s.official ? "official" : "") })}>${Radio({ size: 17 })}</span><span${attributes(
        {
          className:
            "health " +
            (result?.status === "ok"
              ? "ok"
              : result?.status === "error"
                ? "failed"
                : ""),
        },
      )}>${
        result?.status === "ok"
          ? "연결 정상"
          : result?.status === "error"
            ? "확인 필요"
            : "대기"
      }</span></div><h3>${s.name}</h3><p>${s.official ? "기관 공식 RSS" : "Google News 분야별 검색 피드"}</p><small>${
        result?.status === "ok"
          ? `${s.official ? "최근 RSS" : "최근 Google News 검색"} ${result.count}건 응답`
          : result?.error || "아직 실행된 수집 결과가 없습니다."
      }</small></div>`;
    })}</div><section class="panel runs-panel"><div class="panel-header"><h2>수집 실행 기록</h2><span class="muted">실패한 피드와 실패한 AI 분석은 다음 수집 때 다시 시도합니다.</span></div><div class="table-wrap"><table><thead><tr><th>시작 시각 (KST)</th><th>결과</th><th>피드 조회 / 신규 저장</th><th>정상 피드</th></tr></thead><tbody>${(
      state?.runs || []
    ).map(
      (r) =>
        html`<tr><td>${formatDate(r.started_at, true)}</td><td><span${attributes(
          {
            className:
              "status-tag " +
              (r.status === "success"
                ? "good"
                : r.status === "partial"
                  ? "warning"
                  : ""),
          },
        )}>${
          {
            success: "정상",
            partial: "부분 성공",
            failed: "실패",
            running: "진행 중",
          }[r.status]
        }</span></td><td>${r.details.filter((d) => d.status === "ok").reduce((total, d) => total + d.count, 0)}건 / ${r.added}건</td><td>${r.details.filter((d) => d.status === "ok").length} /${" "}${state?.sources?.length || 8}</td></tr>`,
    )}</tbody></table>${!state?.runs?.length && renderEmptyState({ children: html`아직 수집 실행 기록이 없습니다.` })}</div></section><div class="source-caveat">${ShieldCheck({ size: 16 })}<span>뉴스 수집·분류는 공개 피드 기반이며 위성 센서 데이터의 실시간 연동을 의미하지 않습니다. 수집 시각과 원문의 발행 시각을 별도로 기록합니다.</span></div>`;
  }
  function renderTopbar({ view, download }) {
    return html`<header class="topbar">
      <div class="breadcrumb">
        FUTURE STRATEGY ${ChevronRight({ size: 13 })}<strong
          >${navs.find((n) => n.id === view)?.name}</strong
        >
      </div>
      <div class="top-actions">
        <span
          class="private-tag"
          title="팀원 모두 같은 서버 주소로 접속해야 입력 내용이 공유됩니다. 127.0.0.1은 각자의 PC입니다."
          >${ShieldCheck({ size: 12 })} 연결 서버:
          ${location.protocol === "file:"
            ? "127.0.0.1:37214 (파일 미리보기)"
            : location.host}</span
        ><button
          class="icon-btn"
          ${attributes({ onClick: download })}
          title="데이터 내보내기"
          aria-label="데이터 JSON 내보내기"
        >
          ${Download({ size: 16 })}
        </button>
        <div class="avatar">S</div>
      </div>
    </header>`;
  }

  window.OrbitalViews = { renderDashboard };
})();
