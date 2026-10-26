/** 탐색·자동 검토 상태·최종보고서 화면. 업무 동작은 controller가 담당합니다. */
(function () {
  const { html, attributes: a, svgIcon } = window.OrbitalUI;
  const config = window.OrbitalResearchConfig;
  const icon = (name, size = 16) => svgIcon(name, { size });
  const money = (value) => Number(value || 0).toLocaleString("ko-KR") + "원";
  const date = (value) =>
    value
      ? window.OrbitalResearchCore.dayOf(value).replaceAll("-", ".")
      : "발행일 미표기";
  const stage = (value) =>
    ({
      watch: "기회 발굴",
      diligence: "투자검토",
      pilot: "PoC·실증",
      approved: "추진 제안",
      hold: "보류",
      rejected: "종료",
    })[value] || value;
  function empty(title, description) {
    return html`<div class="research-empty">
      ${icon("Search", 26)}
      <h3>${title}</h3>
      <p>${description}</p>
    </div>`;
  }
  function progress(job) {
    if (!job) return null;
    const { done = 0, total = 1 } = job.data.progress || {};
    const ongoing = ["queued", "running"].includes(job.status);
    return html`<div class="job-progress" role="status"><div><span class="job-dot ${ongoing ? "working" : ""}"></span><b>${job.phase}</b><small>${done}/${total}</small></div><div class="progress-track" role="progressbar"${a({ "aria-label": "분석 진행률", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": done })}><i${a({ style: { width: Math.min(100, (done / Math.max(1, total)) * 100) + "%" } })}></i></div>${job.error && html`<p class="job-error">${job.error}</p>`}</div>`;
  }
  function context(m) {
    const {
      research: r,
      sessions,
      currentSession,
      selectSession,
      setModal,
    } = m;
    return html`<div class="research-context">
      <label
        >분석 이력<select
          aria-label="분석 이력 선택"
          ${a({
            value: r.activeId || "",
            onChange: (e) => selectSession(e.target.value),
          })}
        >
          <option value="">전체 워크스페이스</option>
          ${sessions.map(
            (session) =>
              html`<option${a({ value: session.id })}>${session.keyword} · ${date(session.createdAt)} · 기사 ${session.articleCount}건</option>`,
          )}
        </select></label
      ><span class="context-description"
        >${currentSession
          ? `${currentSession.scope.from} ~ ${currentSession.scope.to} · ${config.continents.find((c) => c.id === currentSession.scope.continent)?.name}`
          : "키워드를 선택하면 연결된 검토 초안이 생성됩니다."}</span
      ><button
        class="text-btn"
        ${a({ onClick: () => setModal({ type: "research-settings" }) })}
      >
        ${icon("SlidersHorizontal", 14)} 단계 기준
      </button>
    </div>`;
  }
  function workflow(m) {
    if (!m.currentSession) return null;
    const steps = [
      ["pipeline", "사업·투자 검토", m.opportunities.length],
      ["decisions", "판단 초안", m.decisions.length],
      ["performance", "검증 지표", m.assumptions.length],
      ["reports", "최종보고서", 1],
    ];
    return html`<div class="workflow-links">
      ${steps.map(
        ([view, title, count]) =>
          html`<button${a({ onClick: () => m.setView(view) })}><span>${icon("CheckCircle2", 15)}${title}</span><b>${count}<small>건</small></b>${icon("ArrowUpRight", 14)}</button>`,
      )}
    </div>`;
  }
  function articleCard(article, m) {
    const summary = article.articleAnalysis?.summary;
    return html`<button
      class="research-article"
      ${a({ onClick: () => m.openArticle(article) })}
    >
      <div class="article-eyebrow">
        <span>${article.source}</span><time>${date(article.publishedAt)}</time>
      </div>
      <h3>${window.OrbitalResearchCore.headline(article)}</h3>
      <p>${summary || "클릭하면 한국어 요약을 자동으로 준비합니다."}</p>
      <div class="article-tags">
        <span
          >${article.articleAnalysis?.analysisBasis === "google-news-headline"
            ? "제목 기반 요약"
            : summary
              ? "한국어 요약"
              : "요약 준비"}</span
        >${(article.countryCodes || []).map(
          (code) =>
            html`<small
              >${config.countries.find((country) => country.code === code)
                ?.name || code}</small
            >`,
        )}<i>${article.countryBasis === "publisher-location"
          ? "매체 소재지 기준"
          : "제목 언급 기준"}</i>${icon("ArrowUpRight", 13)}
      </div>
    </button>`;
  }
  function articles(m) {
    return html`<section class="panel research-news">
      <div class="research-section-heading">
        <div>
          <span class="eyebrow">RELATED ARTICLES</span>
          <h2>
            ${m.research.selectedKeyword
              ? `'${m.research.selectedKeyword}' 관련 기사`
              : "관련 기사"}<small>${m.researchArticles.length}</small>
          </h2>
        </div>
        <span class="muted">발행일 최신순</span>
      </div>
      <div class="article-search">
        <input
          type="search"
          aria-label="결과 내 기사 검색"
          placeholder="결과 내 기사 검색"
          ${a({ value: m.query, onChange: (e) => m.setQuery(e.target.value) })}
        />${m.selectedCountry &&
        html`<button
          class="filter-clear"
          ${a({ onClick: () => m.setSelectedCountry(null) })}
        >
          ${config.countries.find(
            (country) => country.mapName === m.selectedCountry,
          )?.name}
          ×
        </button>`}
      </div>
      <div class="research-article-list">
        ${m.articlePage.map((article) => articleCard(article, m))}${!m
          .articlePage.length &&
        empty(
          m.currentSession
            ? "이 조건에 맞는 기사가 없습니다"
            : "키워드를 선택해 보세요",
          m.currentSession
            ? "다른 국가를 선택하거나 검색어를 비워 보세요."
            : "위의 빈도 기반 키워드를 누르면 기사와 국가가 연결됩니다.",
        )}
      </div>
      ${m.articlePageCount > 1 &&
      html`<div class="article-pagination">
        <button
          class="secondary"
          ${a({
            disabled: m.research.page <= 1,
            onClick: () => m.setArticlePage(m.research.page - 1),
          })}
        >
          이전</button
        ><span>${m.research.page} / ${m.articlePageCount}</span
        ><button
          class="secondary"
          ${a({
            disabled: m.research.page >= m.articlePageCount,
            onClick: () => m.setArticlePage(m.research.page + 1),
          })}
        >
          다음
        </button>
      </div>`}
    </section>`;
  }
  function explore(m, newsOnly = false) {
    const {
      research: r,
      setResearchScope,
      discoverKeywords,
      chooseKeyword,
      toggleKeywords,
    } = m;
    const keywords = r.discovery?.data.keywords || r.overview?.keywords || [];
    const corpusCount = r.discovery?.data.total ?? r.overview?.total ?? 0;
    const covered = config.countries.filter(
      (country) =>
        r.scope.continent === "all" || country.continent === r.scope.continent,
    );
    const visibleKeywords = r.showAllKeywords ? keywords : keywords.slice(0, 3);
    return html`<div class="explore-flow">
      ${!newsOnly &&
      html`<div class="research-home-grid">
        <section class="panel globe-panel research-globe">
          <div class="research-section-heading">
            <div>
              <span class="eyebrow">GEOGRAPHIC SIGNALS</span>
              <h2>글로벌 시그널</h2>
            </div>
            <span class="live-pill"
              ><i></i>${m.relatedCountries.length
                ? `${m.relatedCountries.length}개국`
                : "탐색 대기"}</span
            >
          </div>
          <div id="globe-root"></div>
          <div class="country-chips">
            ${m.relatedCountries.map(
              (country) =>
                html`<button${a({ className: m.selectedCountry === country.mapName ? "selected" : "", onClick: () => m.setSelectedCountry(m.selectedCountry === country.mapName ? null : country.mapName) })}>${country.name}<b>${country.count}</b></button>`,
            )}
          </div>
          <p class="geo-note">
            ${m.relatedCountries.length
              ? "선택한 키워드의 기사에서 연결된 국가를 표시합니다."
              : "키워드를 선택하면 관련 기사가 있는 국가만 빛나는 거점으로 표시됩니다."}
          </p>
        </section>
        <div class="research-home-controls">
          <section class="panel research-search">
            <div class="research-search-title">
              <span class="step-number">01</span>
              <div>
                <h2>탐색 범위를 정하세요</h2>
                <p>
                  선택한 기간과 대륙의 기사를 검색해 자주 등장하는 키워드를
                  찾습니다.
                </p>
              </div>
            </div>
            <div class="scope-controls">
              <label
                >기간<select
                  aria-label="검색 기간"
                  ${a({
                    value: r.scope.range,
                    onChange: (e) => setResearchScope("range", e.target.value),
                  })}
                >
                  <option value="7">최근 7일</option>
                  <option value="30">최근 30일</option>
                  <option value="90">최근 90일</option>
                  <option value="custom">직접 지정</option>
                </select></label
              ><label
                >대륙<select
                  aria-label="검색 대륙"
                  ${a({
                    value: r.scope.continent,
                    onChange: (e) =>
                      setResearchScope("continent", e.target.value),
                  })}
                >
                  ${config.continents.map(
                    (continent) =>
                      html`<option${a({ value: continent.id })}>${continent.name}</option>`,
                  )}
                </select></label
              >${r.scope.range === "custom" &&
              html`<label
                  >시작일<input
                    type="date"
                    aria-label="검색 시작일"
                    ${a({
                      value: r.scope.from,
                      onChange: (e) => setResearchScope("from", e.target.value),
                    })} /></label
                ><label
                  >종료일<input
                    type="date"
                    aria-label="검색 종료일"
                    ${a({
                      value: r.scope.to,
                      onChange: (e) => setResearchScope("to", e.target.value),
                    })}
                /></label>`}<button
                class="primary"
                ${a({
                  onClick: discoverKeywords,
                  disabled: r.searching || !m.connected,
                })}
              >
                ${icon(r.searching ? "RefreshCw" : "Search", 15)}${r.searching
                  ? "뉴스 검색 중"
                  : "뉴스 검색"}
              </button>
            </div>
            <div class="scope-meta">
              <span>${r.scope.from} — ${r.scope.to}</span
              ><span
                >기존 8개 피드 + ${covered.length}개국 · 주요 매체
                ${covered.length * 5}곳</span
              >
            </div>
            ${r.searching && progress(r.discovery)}
          </section>
          <section class="panel keyword-section">
            <div class="research-section-heading keyword-heading">
              <div class="research-search-title">
                <span class="step-number">02</span>
                <div>
                  <h2>키워드를 선택하세요</h2>
                  <p>
                    서로 다른 기사에 등장한 빈도순 · 기사 1건은 키워드당 한 번
                    집계
                  </p>
                </div>
              </div>
              <span class="corpus-count"
                >${corpusCount.toLocaleString()}개 기사 분석 범위</span
              >
              ${keywords.length > 3 &&
              html`<button
                class="keyword-toggle"
                aria-expanded="${r.showAllKeywords}"
                ${a({ onClick: toggleKeywords })}
              >
                <span aria-hidden="true">${r.showAllKeywords ? "−" : "⋯"}</span
                >${r.showAllKeywords
                  ? "접기"
                  : `더보기 ${keywords.length - 3}개`}
              </button>`}
            </div>
            <div class="keyword-cloud">
              ${visibleKeywords.map(
                (keyword, index) =>
                  html`<button${a({ className: "keyword-chip " + (r.selectedKeyword === keyword.word ? "selected" : ""), disabled: r.searching || r.starting, onClick: () => chooseKeyword(keyword.word) })}><small>${String(index + 1).padStart(2, "0")}</small><span>${keyword.word}</span><b>${keyword.count}</b></button>`,
              )}
            </div>
            ${!keywords.length &&
            html`<p class="empty-keywords">
              ${r.searching
                ? "실시간 피드를 확인하고 있습니다."
                : "뉴스 검색을 실행하면 이곳에 빈도 기반 키워드가 나타납니다."}
            </p>`}
            <div class="keyword-footnote">
              ${icon("Orbit", 14)} 키워드 선택 시 관련 기사와 검토 초안을
              자동으로 준비합니다.
            </div>
            ${r.discovery?.error &&
            !r.searching &&
            html`<p class="job-error">${r.discovery.error}</p>`}
          </section>
        </div>
      </div>`}
      ${m.currentSession &&
      html`<div class="analysis-heading">
          <div>
            <span class="eyebrow">CONNECTED WORKSPACE</span>
            <h2>${r.selectedKeyword} <small>분석 워크스페이스</small></h2>
          </div>
          <div class="analysis-numbers">
            <span><b>${m.researchArticles.length}</b>기사</span
            ><span><b>${m.relatedCountries.length}</b>국가</span
            ><span><b>${m.opportunities.length}</b>아이디어</span>
          </div>
        </div>
        ${workflow(m)}${progress(r.analysis)}${["partial", "failed"].includes(
          r.analysis?.status,
        ) &&
        html`<button class="text-btn" ${a({ onClick: m.retryAnalysis })}>
          ${icon("RefreshCw", 13)} 미완료 분석 재시도
        </button>`}`}
      ${(newsOnly || m.currentSession) && articles(m)}
    </div>`;
  }
  function reports(m) {
    const all = m.state.records.filter((record) => record.kind === "report");
    const report =
      all.find((record) => record.researchId === m.research.activeId) ||
      (!m.research.activeId ? all[0] : null);
    if (!report)
      return empty(
        "사업 아이디어 보고안을 준비합니다",
        "요약에서 키워드를 선택하면 예산과 근거 기사가 연결된 보고서가 자동으로 작성됩니다.",
      );
    const ideas = m.state.records
      .filter(
        (record) =>
          record.kind === "opportunity" &&
          record.researchId === report.researchId &&
          !record.excluded &&
          !record.excludeFromReport,
      )
      .sort((a, b) => b.score - a.score);
    const focus =
      ideas.find((idea) => idea.id === report.focusOpportunityId) || ideas[0];
    return html`<div class="report-toolbar">
        <div>
          <span class="status-tag good"
            >${report.provisional
              ? "본문 확인 중 · 임시 초안"
              : "편집 가능한 결재 초안"}</span
          ><span class="muted"
            >${date(report.updatedAt || report.createdAt)} ·
            ${report.userEdited ? "사용자 수정 반영" : "자동 생성"}</span
          >
        </div>
        <div>
          <button
            class="secondary"
            ${a({
              onClick: () => m.setModal({ type: "report", data: report }),
            })}
          >
            ${icon("FileCheck2", 15)} 보고안 편집</button
          ><button
            class="secondary"
            ${a({ onClick: () => m.openReportPrint(report.id) })}
          >
            인쇄 화면</button
          ><button
            class="primary"
            ${a({
              disabled: m.research.exporting,
              onClick: () => m.exportPdf(report.id),
            })}
          >
            ${icon("Download", 15)}${m.research.exporting
              ? "PDF 생성 중…"
              : "PDF 다운로드"}
          </button>
        </div>
      </div>
      ${report.provisional &&
      html`<p class="job-error">
        기사 본문을 확인하고 있습니다. 본문·요약이 확보된 기사만 최종 평가와
        보고서에 반영됩니다.
      </p>`}
      <article class="report-paper">
        <div class="report-paper-top">
          <span>ORBITAL / BUSINESS PROPOSAL</span><b>검토·결재 요청</b>
        </div>
        <h1>${report.title}</h1>
        <div class="report-meta">
          <span>${report.department} · ${report.author}</span
          ><span>${date(report.createdAt)}</span>
        </div>
        <div class="approval-grid">
          ${[
            ["기안", report.author],
            ["검토", report.reviewer],
            ["결재", report.approver],
          ].map(
            ([role, name]) =>
              html`<div>
                <span>${role}</span><b>${name}</b
                ><small
                  >${role === "기안" ? "작성 완료 · 승인 전" : "대기"}</small
                >
              </div>`,
          )}
        </div>
        <div class="report-request">
          <span>결재 요청사항</span>
          <p>${report.request}</p>
          <div>
            <span>권고 최소 PoC 예산</span
            ><b
              >${report.budgetStatus === "pending"
                ? "산정 보류"
                : money(report.budget.total)}</b
            ><small>8주 · 내부 계획단가 · 부가세 별도</small>
          </div>
        </div>
        ${[
          ["01", "검토 요약", report.executive],
          ["02", "사업 필요성과 목표", report.strategic],
        ].map(([num, title, text]) => reportSection(num, title, text))}
        <section class="report-section">
          <h2><span>03</span>아이디어 평가와 단계 제안</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>사업 아이디어</th>
                  <th>점수</th>
                  <th>자동 분류</th>
                  <th>PoC 예산</th>
                </tr>
              </thead>
              <tbody>
                ${ideas.map(
                  (idea) =>
                    html`<tr>
                      <td>
                        <button
                          class="text-btn"
                          ${a({
                            onClick: () =>
                              m.setModal({ type: "opportunity", data: idea }),
                          })}
                        >
                          ${idea.title}
                        </button>
                      </td>
                      <td>${idea.score}</td>
                      <td>${stage(idea.stage)}</td>
                      <td>${money(idea.budget?.total || idea.amount * 1e8)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
          <p class="report-footnote">
            가중점수 = 적합도 30% + 관심 빈도 25% + 수익 신호 25% + 기술 차별
            가설 20%. 최종 승인은 담당자의 검토·결재로 확정합니다.
          </p>
        </section>
        ${[
          ["04", "대안 비교와 기대효과", report.economic],
          ["05", "고객·수익모델·조달", report.commercial],
        ].map(([num, title, text]) => reportSection(num, title, text))}
        <section class="report-section">
          <h2><span>06</span>최소 PoC 예산</h2>
          <p class="report-focus">기준 안건: ${focus?.title}</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>항목</th>
                  <th>수량</th>
                  <th>계획 단가</th>
                  <th>금액</th>
                </tr>
              </thead>
              <tbody>
                ${report.budget.items.map(
                  (item) =>
                    html`<tr>
                      <td>${item.label}</td>
                      <td>${item.quantity} ${item.unit}</td>
                      <td>${money(item.unitCost)}</td>
                      <td>${money(item.subtotal)}</td>
                    </tr>`,
                )}
                <tr>
                  <td colspan="3">예비비 ${report.budget.reservePercent}%</td>
                  <td>${money(report.budget.reserve)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="report-budget-total">
            <span>최소 PoC 예산 합계</span
            ><b
              >${report.budgetStatus === "pending"
                ? "산정 보류"
                : money(report.budget.total)}</b
            >
          </div>
          <p class="report-footnote">
            ${report.budget.assumptions} 계획 단가는 견적 확인 전의 내부
            가정입니다.
          </p>
        </section>
        ${[
          ["07", "추진 일정과 책임", report.management],
          ["08", "위험요인과 대응", report.risks],
        ].map(([num, title, text]) => reportSection(num, title, text))}
        <section class="report-section">
          <h2><span>09</span>기사 근거와 검증 계획</h2>
          <p>
            아이디어별 근거 기사
            ${new Set(ideas.flatMap((idea) => idea.evidenceIds || [])).size}건 ·
            검증 지표
            ${m.state.records.filter(
              (record) =>
                record.kind === "assumption" &&
                record.researchId === report.researchId,
            ).length}개
          </p>
          <div class="report-evidence">
            ${m.state.signals
              .filter((signal) =>
                ideas.some((idea) => idea.evidenceIds.includes(signal.id)),
              )
              .map(
                (article) =>
                  html`<button${a({ onClick: () => m.openArticle(article) })}><span>${date(article.publishedAt)} · ${article.source}</span><b>${article.title}</b>${icon("ArrowUpRight", 14)}</button>`,
              )}
          </div>
          <p class="report-footnote">
            PDF에는 연결된 근거 기사의 링크와 검증 지표·목표·측정 상태를 함께
            출력합니다. 실적은 측정 전 상태로 보존합니다.
          </p>
        </section>
        <div class="report-references">
          보고서 양식 참고:
          ${config.templateSources.map(
            (source) =>
              html`<a${a({ href: source.url, target: "_blank", rel: "noopener noreferrer" })}>${source.name} ↗</a>`,
          )}
        </div>
      </article>`;
  }
  function reportSection(number, title, value) {
    return html`<section class="report-section">
      <h2><span>${number}</span>${title}</h2>
      <p>${value}</p>
    </section>`;
  }
  function sources(m) {
    const job = m.research.discovery;
    const details = job?.data.details || m.lastRun?.details || [];
    const scope = m.research.scope;
    return html`<div class="source-summary-grid"><section class="panel"><span class="eyebrow">SOURCE COVERAGE</span><h2>${config.countries.length}개국 · ${config.countries.length * 5}개 주요 매체</h2><p>기존 NASA·ESA·6개 분야 Google News 피드를 유지하고, 국가별 주요 매체 5곳의 기사를 Google News에서 함께 검색합니다.</p><p class="muted">주요 매체는 검색용 선정 목록입니다. 통계상 순위 1~5위라는 의미는 아닙니다.</p><button class="primary"${a({ onClick: m.discoverKeywords, disabled: m.research.searching })}>${icon("RefreshCw", 14)} 현재 범위 실시간 검색</button></section><section class="panel"><span class="eyebrow">CURRENT SEARCH</span><h2>${config.continents.find((item) => item.id === scope.continent)?.name}</h2><p>${scope.from} ~ ${scope.to}</p><b>${details.filter((item) => item.status === "ok").length} / ${details.length}개 피드 정상</b><p>기간·매체·URL 중복을 확인하고 발행일 기준 최신순으로 정렬합니다. 요약 실패 기사는 목록에서 제외합니다.</p></section></div>${m.research.searching && progress(job)}${
      m.research.analysis &&
      html`<section class="panel source-analysis">
        <h2>선택 키워드 처리 상태</h2>
        ${progress(m.research.analysis)}
      </section>`
    }<section class="panel source-feed-results"><div class="research-section-heading"><h2>최근 실제 검색 응답</h2><span class="muted">${details.length}개 피드</span></div><div class="table-wrap"><table><thead><tr><th>출처</th><th>상태</th><th>응답 항목</th><th>확인 내용</th></tr></thead><tbody>${details.map(
      (item) =>
        html`<tr>
          <td>${item.name}</td>
          <td>
            <span
              class="status-tag ${item.status === "ok" ? "good" : "warning"}"
              >${item.status === "ok" ? "정상" : "연결 확인"}</span
            >
          </td>
          <td>${item.count || 0}건</td>
          <td>${item.error || "Google News / 공개 RSS 응답 확인"}</td>
        </tr>`,
    )}</tbody></table>${!details.length && empty("검색 실행 기록이 없습니다", "기간·대륙을 선택하거나 현재 범위 실시간 검색을 실행해 주세요.")}</div></section><section class="panel publisher-catalog"><div class="research-section-heading"><div><h2>국가별 주요 매체 목록</h2><p><a${a({ href: config.mediaReference, target: "_blank", rel: "noopener noreferrer" })}>Reuters Institute 국가별 미디어 자료 참고 ↗</a></p></div></div><div>${config.countries.map(
      (country) =>
        html`<details>
          <summary>${country.name}<span>5개 매체</span></summary>
          <ul>
            ${country.outlets.map(
              (outlet) =>
                html`<li><a${a({ href: "https://" + outlet.domain, target: "_blank", rel: "noopener noreferrer" })}>${outlet.name}<small>${outlet.domain} ↗</small></a></li>`,
            )}
          </ul>
        </details>`,
    )}</div></section><section class="panel source-feed-results"><h2>수집·업데이트 이력</h2><div class="table-wrap"><table><thead><tr><th>실행일</th><th>상태</th><th>새 기사</th><th>정상 피드</th></tr></thead><tbody>${(
      m.state.runs || []
    ).map(
      (run) =>
        html`<tr>
          <td>
            ${date(run.started_at)} ${String(run.started_at).slice(11, 16)} UTC
          </td>
          <td>
            ${{
              success: "성공",
              partial: "부분 성공",
              failed: "실패",
              running: "진행 중",
            }[run.status]}
          </td>
          <td>${run.added}건</td>
          <td>
            ${run.details.filter((item) => item.status === "ok").length}/${run
              .details.length}
          </td>
        </tr>`,
    )}</tbody></table></div></section>`;
  }
  function modal(m) {
    if (!m.modal) return null;
    const { modal, busy, save } = m;
    if (modal.type === "research-settings") {
      const gates = m.research.overview?.gates || config.gates;
      return {
        title: "자동 단계 분류 기준",
        body: html`<form
          class="editor-form"
          ${a({
            onSubmit: async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await m.saveGates(
                Object.fromEntries(
                  Object.keys(config.gates).map((key) => [
                    key,
                    Number(form.get(key)),
                  ]),
                ),
              );
            },
          })}
        >
          <p class="form-note">
            각 항목은 1~5점, 가중합은 100점으로 환산합니다. 점수에 따라 단계를
            제안하며, 확정 결재와 실적은 담당자가 기록합니다. 변경 기준은 다음
            새 분석에 적용됩니다.
          </p>
          ${Object.keys(gates).map(
            (key) =>
              html`<label
                >${stage(key)} 진입 기준<input
                  type="number"
                  name="${key}"
                  min="20"
                  max="100"
                  required${a({ value: gates[key] })}
              /></label>`,
          )}<button class="primary" ${a({ disabled: busy })}>
            단계 기준 저장
          </button>
        </form>`,
      };
    }
    if (modal.type === "draft-decision") {
      const d = modal.data;
      return {
        title: "자동 판단 초안 수정",
        body: html`<form
          class="editor-form"
          ${a({
            onSubmit: async (event) => {
              event.preventDefault();
              await save(
                "records/" + d.id,
                {
                  revision: d.revision,
                  data: Object.fromEntries(new FormData(event.currentTarget)),
                },
                "PATCH",
              );
            },
          })}
        >
          <p class="form-note">
            이 기록은 검토 제안 초안입니다. 확정 결정은 안건의 의사결정 기록에서
            별도로 남길 수 있습니다.
          </p>
          <label
            >제안 단계<select name="outcome" ${a({ value: d.outcome })}>
              ${[
                "watch",
                "diligence",
                "pilot",
                "approved",
                "hold",
                "rejected",
              ].map(
                (value) =>
                  html`<option value="${value}">${stage(value)}</option>`,
              )}
            </select></label
          ><label
            >판단 근거<textarea
              name="rationale"
              rows="5"
              required${a({ value: d.rationale })}
            ></textarea></label
          ><label
            >후속 조건<textarea
              name="conditions"
              rows="3"
              ${a({ value: d.conditions })}
            ></textarea></label
          ><button class="primary" ${a({ disabled: busy })}>
            판단 초안 저장
          </button>
        </form>`,
      };
    }
    if (modal.type === "report") {
      const r = modal.data;
      const [budget, setBudget] = window.OrbitalApp.draftState(r.budget);
      const subtotal = budget.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );
      const fields = [
        ["executive", "검토 요약"],
        ["strategic", "사업 필요성과 목표"],
        ["economic", "대안 비교·기대효과"],
        ["commercial", "고객·수익모델·조달"],
        ["management", "추진 일정과 책임"],
        ["risks", "위험요인과 대응"],
        ["request", "결재 요청사항"],
      ];
      return {
        title: "사업 아이디어 보고안 편집",
        body: html`<form
          class="editor-form report-editor"
          ${a({
            onSubmit: async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget),
                values = Object.fromEntries(form);
              const items = budget.items.map((item, index) => ({
                label: form.get("budgetLabel" + index),
                unit: form.get("budgetUnit" + index),
                quantity: Number(form.get("budgetQuantity" + index)),
                unitCost: Number(form.get("budgetCost" + index)),
              }));
              await save(
                "records/" + r.id,
                {
                  revision: r.revision,
                  data: {
                    ...Object.fromEntries(
                      [
                        "title",
                        "author",
                        "department",
                        "reviewer",
                        "approver",
                        ...fields.map(([key]) => key),
                      ].map((key) => [key, values[key]]),
                    ),
                    budget: {
                      items,
                      reservePercent: Number(form.get("reservePercent")),
                      assumptions: form.get("budgetAssumptions"),
                    },
                  },
                },
                "PATCH",
              );
            },
          })}
        >
          <label
            >보고서 제목<input name="title" required${a({ value: r.title })}
          /></label>
          <div class="form-row">
            <label
              >기안자<input name="author" ${a({ value: r.author })} /></label
            ><label
              >부서<input name="department" ${a({ value: r.department })}
            /></label>
          </div>
          <div class="form-row">
            <label
              >검토자<input
                name="reviewer"
                ${a({ value: r.reviewer })} /></label
            ><label
              >결재자<input name="approver" ${a({ value: r.approver })}
            /></label>
          </div>
          ${fields.map(
            ([key, label]) =>
              html`<label
                >${label}<textarea
                  name="${key}"
                  rows="4"
                  ${a({ value: r[key] })}
                ></textarea>
              </label>`,
          )}
          <h3>최소 PoC 예산 · 계획 단가 수정</h3>
          <p class="form-note">
            수량 × 단가 + 예비비로 자동 계산합니다. 항목을 제외하려면 수량을
            0으로 입력하세요.
          </p>
          <div class="budget-edit-grid">
            ${budget.items.map(
              (item, index) =>
                html`<fieldset>
                  <legend>항목 ${index + 1}</legend>
                  <label
                    >항목명<input
                      name="budgetLabel${index}"
                      ${a({ value: item.label })}
                  /></label>
                  <div class="form-row">
                    <label
                      >수량<input
                        name="budgetQuantity${index}"
                        type="number"
                        min="0"
                        step="any"
                        ${a({
                          value: item.quantity,
                          onChange: (event) =>
                            setBudget({
                              ...budget,
                              items: budget.items.map((row, n) =>
                                n === index
                                  ? {
                                      ...row,
                                      quantity: Number(event.target.value),
                                    }
                                  : row,
                              ),
                            }),
                        })} /></label
                    ><label
                      >단위<input
                        name="budgetUnit${index}"
                        ${a({ value: item.unit })} /></label
                    ><label
                      >단가 (원)<input
                        name="budgetCost${index}"
                        type="number"
                        min="0"
                        ${a({
                          value: item.unitCost,
                          onChange: (event) =>
                            setBudget({
                              ...budget,
                              items: budget.items.map((row, n) =>
                                n === index
                                  ? {
                                      ...row,
                                      unitCost: Number(event.target.value),
                                    }
                                  : row,
                              ),
                            }),
                        })}
                    /></label>
                  </div>
                </fieldset>`,
            )}
          </div>
          <button
            type="button"
            class="secondary"
            ${a({
              onClick: () =>
                setBudget({
                  ...budget,
                  items: [
                    ...budget.items,
                    {
                      label: "추가 항목",
                      unit: "식",
                      quantity: 1,
                      unitCost: 0,
                    },
                  ],
                }),
            })}
          >
            예산 항목 추가</button
          ><label
            >예비비 (%)<input
              type="number"
              name="reservePercent"
              min="0"
              max="50"
              step="any"
              ${a({
                value: budget.reservePercent,
                onChange: (event) =>
                  setBudget({
                    ...budget,
                    reservePercent: Number(event.target.value),
                  }),
              })}
          /></label>
          <div class="report-budget-total">
            <span>계산된 최소 PoC 예산</span
            ><b
              >${money(
                Math.round(
                  subtotal * (1 + Number(budget.reservePercent) / 100),
                ),
              )}</b
            >
          </div>
          <label
            >예산 가정·제외 범위<textarea
              name="budgetAssumptions"
              rows="3"
              ${a({ value: budget.assumptions })}
            ></textarea></label
          ><button class="primary" ${a({ disabled: busy })}>보고안 저장</button>
        </form>`,
      };
    }
    return null;
  }
  window.OrbitalResearchViews = {
    explore,
    context,
    workflow,
    progress,
    reports,
    sources,
    modal,
  };
})();
