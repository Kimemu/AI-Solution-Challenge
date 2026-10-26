/** 탐색·분석 작업의 화면 상태, 폴링, 보고서 다운로드를 관리합니다. */
(function () {
  const core = window.OrbitalResearchCore;
  function create({
    request,
    state,
    ui,
    render,
    notify,
    load,
    setModal,
    apiBase,
    focusGlobe,
  }) {
    const data = {
      scope: core.scopeOf(),
      overview: null,
      discovery: null,
      analysis: null,
      result: null,
      activeId: null,
      selectedKeyword: "",
      page: 1,
      searching: false,
      starting: false,
      exporting: false,
      showAllKeywords: false,
    };
    let initialized = false,
      scopeTimer,
      discoveryVersion = 0,
      resultsVersion = 0;
    const timers = new Map();
    const terminal = (job) => !["queued", "running"].includes(job?.status);
    async function loadResults(id, repaint = true) {
      const version = ++resultsVersion;
      const result = await request(
        "research/results/" + encodeURIComponent(id),
      );
      if (version !== resultsVersion || id !== data.activeId) return;
      data.result = result;
      data.analysis = result.job;
      if (ui.modal?.type === "signal") {
        const latest = result.articles.find(
          (article) => article.id === ui.modal.data.id,
        );
        if (latest) ui.modal.data = latest;
      }
      if (repaint) render();
    }
    function poll(job, kind, version) {
      if (timers.has(kind)) clearTimeout(timers.get(kind));
      if (terminal(job)) return;
      timers.set(
        kind,
        setTimeout(async () => {
          try {
            const next = await request(
              "research/jobs/" + encodeURIComponent(job.id),
            );
            if (kind === "discovery" && version !== discoveryVersion) return;
            if (kind === "analysis" && data.activeId !== next.data.sessionId)
              return;
            const previousDone = data.analysis?.data.progress?.done;
            data[kind] = next;
            if (kind === "analysis") {
              await loadResults(data.activeId, false);
              if (terminal(next) || next.data.progress?.done !== previousDone)
                await load();
            }
            if (terminal(next)) {
              if (kind === "discovery") {
                data.searching = false;
                data.overview = { ...data.overview, ...next.data };
                await load();
              }
              if (next.error) notify(next.error);
            }
            render();
            poll(next, kind, version);
          } catch (error) {
            notify(error.message);
            data.searching = false;
            render();
          }
        }, 1800),
      );
    }
    async function discover() {
      if (!ui.connected) {
        notify("서버가 연결된 뒤 검색할 수 있습니다.");
        return;
      }
      const version = ++discoveryVersion;
      data.searching = true;
      data.discovery = null;
      render();
      try {
        const job = await request("research/discover", "POST", {
          scope: data.scope,
        });
        if (version !== discoveryVersion) return;
        data.discovery = job;
        data.overview = { ...data.overview, ...job.data };
        if (terminal(job)) data.searching = false;
        render();
        poll(job, "discovery", version);
      } catch (error) {
        data.searching = false;
        notify(error.message);
      }
    }
    function setScope(key, value) {
      discoveryVersion++;
      const next = { ...data.scope, [key]: value };
      data.scope = next;
      data.page = 1;
      data.showAllKeywords = false;
      data.selectedKeyword = "";
      data.activeId = null;
      data.result = null;
      data.discovery = null;
      data.overview = {
        gates: data.overview?.gates || window.OrbitalResearchConfig.gates,
      };
      data.searching = true;
      ui.selectedCountry = null;
      ui.query = "";
      clearTimeout(scopeTimer);
      render();
      scopeTimer = setTimeout(async () => {
        try {
          data.scope = core.scopeOf(next);
          data.overview = await request("research/recommendations", "POST", {
            scope: data.scope,
          });
          render();
          await discover();
        } catch (error) {
          data.searching = false;
          notify(error.message);
        }
      }, 450);
    }
    async function chooseKeyword(keyword, force = false) {
      if (!ui.connected || data.starting) return;
      data.starting = true;
      data.selectedKeyword = keyword;
      data.page = 1;
      ui.selectedCountry = null;
      ui.sector = "all";
      ui.query = "";
      render();
      try {
        const job = await request("research/analyze", "POST", {
          keyword,
          scope: core.scopeOf(data.scope),
          discoveryId: data.discovery?.id,
          force,
        });
        data.activeId = job.data.sessionId;
        data.analysis = job;
        await loadResults(data.activeId, false);
        if (data.result?.countries[0]) focusGlobe(data.result.countries[0]);
        await load();
        notify(
          job.cached
            ? "저장된 분석을 열었습니다. 수정한 내용이 유지됩니다."
            : "모든 업무 세션에 검토 초안을 저장했습니다. 한국어 요약을 준비합니다.",
        );
        poll(job, "analysis");
      } catch (error) {
        notify(error.message);
      } finally {
        data.starting = false;
        render();
      }
    }
    async function selectSession(id) {
      data.activeId = id || null;
      data.page = 1;
      data.result = null;
      ui.selectedCountry = null;
      if (id) {
        await loadResults(id, false);
        if (data.result?.countries[0]) focusGlobe(data.result.countries[0]);
        data.scope = data.result.session.scope;
        data.selectedKeyword = data.result.session.keyword;
        data.overview = await request("research/recommendations", "POST", {
          scope: data.scope,
        });
        poll(data.analysis, "analysis");
      } else {
        data.analysis = null;
        data.selectedKeyword = "";
      }
      render();
    }
    async function afterLoad() {
      if (!initialized) {
        initialized = true;
        const version = discoveryVersion;
        const latest = state.records.find(
          (record) => record.kind === "research",
        );
        if (latest) await selectSession(latest.id);
        else {
          const overview = await request("research/overview");
          if (version === discoveryVersion) data.overview = overview;
          render();
        }
      } else if (data.activeId) await loadResults(data.activeId);
    }
    async function openArticle(article) {
      setModal({ type: "signal", data: article });
      try {
        const latest = await request(
          "signals/" + encodeURIComponent(article.id),
        );
        if (ui.modal?.type !== "signal" || ui.modal.data.id !== article.id)
          return;
        ui.modal.data = latest;
        if (
          !latest.articleAnalysis &&
          ["queued", "running"].includes(data.analysis?.status) &&
          data.result?.session.articleIds.includes(article.id)
        )
          ui.modal.data.articleJob ||= { status: "pending" };
        render();
        if (
          (!latest.articleAnalysis?.summary ||
            latest.articleAnalysis.analysisBasis !== "article-body") &&
          !["queued", "running"].includes(data.analysis?.status) &&
          !["pending", "running"].includes(latest.articleJob?.status)
        ) {
          await request("article-analysis", "POST", { id: article.id });
          ui.modal.data.articleJob = { status: "pending" };
          render();
        }
      } catch (error) {
        notify(error.message);
      }
    }
    async function retryAnalysis() {
      if (!data.analysis) return;
      try {
        const job = await request("research/retry", "POST", {
          id: data.analysis.id,
        });
        data.analysis = job;
        render();
        poll(job, "analysis");
      } catch (error) {
        notify(error.message);
      }
    }
    async function exportPdf(id) {
      data.exporting = true;
      render();
      try {
        const response = await fetch(
          apiBase + "/api/reports/" + encodeURIComponent(id) + "/pdf",
        );
        if (!response.ok)
          throw new Error(
            (await response.json()).error || "PDF 생성에 실패했습니다.",
          );
        const blob = await response.blob(),
          url = URL.createObjectURL(blob),
          anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "ORBITAL-사업아이디어-보고안.pdf";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (error) {
        notify(error.message);
      } finally {
        data.exporting = false;
        render();
      }
    }
    function model() {
      const session = state.records.find(
        (record) => record.id === data.activeId,
      );
      const available = data.activeId
        ? (
            data.result?.articles ||
            state.signals.filter((signal) =>
              session?.articleIds?.includes(signal.id),
            )
          ).map(core.enrich)
        : [];
      const matches = available.filter(
        (signal) =>
          (ui.sector === "all" || ui.sector === signal.category) &&
          (!ui.query ||
            [signal.title, signal.summary, signal.source]
              .join(" ")
              .toLowerCase()
              .includes(ui.query.toLowerCase())),
      );
      const countries = core.countryCounts(matches);
      const selected = window.OrbitalResearchConfig.countries.find(
        (country) => country.mapName === ui.selectedCountry,
      );
      const articles = matches.filter(
        (signal) => !selected || signal.countryCodes.includes(selected.code),
      );
      const pageCount = Math.max(1, Math.ceil(articles.length / 12));
      data.page = Math.min(data.page, pageCount);
      return {
        research: data,
        currentSession: session,
        researchArticles: articles,
        relatedCountries: countries,
        globeLocations: countries.map((country) => ({
          ...country,
          country: country.mapName,
          label: true,
        })),
        articlePage: articles.slice((data.page - 1) * 12, data.page * 12),
        articlePageCount: pageCount,
        sessions: state.records.filter((record) => record.kind === "research"),
        setResearchScope: setScope,
        discoverKeywords: discover,
        toggleKeywords() {
          data.showAllKeywords = !data.showAllKeywords;
          render();
        },
        chooseKeyword,
        selectSession,
        openArticle,
        retryAnalysis,
        setArticlePage(page) {
          data.page = page;
          render();
        },
        exportPdf,
        openReportPrint(id) {
          window.open(
            apiBase + "/api/reports/" + encodeURIComponent(id) + "/html",
            "_blank",
            "noopener",
          );
        },
        async saveGates(gates) {
          const result = await request("research/settings", "POST", { gates });
          data.overview.gates = result.gates;
          setModal(null);
          notify("다음 분석부터 새 단계 기준을 적용합니다.");
        },
      };
    }
    return { model, afterLoad, data };
  }
  window.OrbitalResearchController = { create };
})();
