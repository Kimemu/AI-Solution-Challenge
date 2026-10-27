/** 상태 변경과 서버 요청을 관리합니다. 화면 HTML은 views.js에 있습니다. */
(function () {
  const { sectorOf } = window.OrbitalConfig;
  const apiBase = location.protocol === "file:" ? "http://127.0.0.1:37214" : "";
  const ui = {
    view: "overview",
    sector: "all",
    selectedCountry: null,
    query: "",
    newsMode: "all",
    modal: null,
    busy: false,
    refreshing: false,
    toast: "",
    error: "",
    connected: false,
  };
  const state = {
    signals: [],
    excludedSignalIds: [],
    records: [],
    audit: [],
    runs: [],
    sources: window.OrbitalConfig.sourceFeeds,
    serverAt: null,
  };
  let toastTimer;
  let globe;
  let savedGlobeView;
  let draft = [];
  let draftIndex = 0;
  let requestId = 0;
  let renderedModalKey = "";
  let pendingGlobeFocus;
  const research = window.OrbitalResearchController.create({
    request,
    state,
    ui,
    render,
    notify,
    load,
    setModal,
    apiBase,
    focusGlobe(country) {
      pendingGlobeFocus = country;
    },
  });

  async function request(path, method = "GET", body) {
    const response = await fetch(apiBase + "/api/" + path, {
      method,
      cache: "no-store",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error(
        "서버 응답을 확인할 수 없습니다. start.cmd를 실행해 주세요.",
      );
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "요청을 처리하지 못했습니다.");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  async function load() {
    const current = ++requestId;
    try {
      const result = await request("state");
      if (current !== requestId) return;
      Object.assign(state, result);
      state.signals = state.signals.filter(
        window.OrbitalResearchCore.isArticleVisible,
      );
      if (ui.modal?.type === "signal") {
        const id = ui.modal.data.id;
        try {
          const latest = await request("signals/" + encodeURIComponent(id));
          if (ui.modal?.type === "signal" && ui.modal.data.id === id) {
            if (!window.OrbitalResearchCore.isArticleVisible(latest)) {
              ui.modal = null;
              notify("요약에 실패한 기사를 목록에서 제외했습니다.");
            } else ui.modal.data = latest;
          }
        } catch (error) {
          if (
            error.status === 404 &&
            ui.modal?.type === "signal" &&
            ui.modal.data.id === id
          )
            ui.modal = null;
        }
      }
      ui.connected = true;
      ui.error = "";
      render();
      void research.afterLoad().catch((error) => notify(error.message));
    } catch {
      if (current !== requestId) return;
      ui.connected = false;
      ui.error = "서버에 연결되지 않았습니다. start.cmd를 실행해 주세요.";
      render();
    }
  }
  function notify(message) {
    clearTimeout(toastTimer);
    ui.toast = message;
    render();
    toastTimer = setTimeout(() => {
      ui.toast = "";
      render();
    }, 4200);
  }
  function setModal(modal) {
    if (ui.busy) return;
    ui.modal = modal;
    draft = [];
    render();
  }
  function setView(view) {
    ui.view = view;
    render();
    window.scrollTo(0, 0);
  }
  function setSector(sector) {
    ui.sector = sector;
    render();
  }
  function setSelectedCountry(country) {
    if (country)
      pendingGlobeFocus = window.OrbitalResearchConfig.countries.find(
        (item) => item.mapName === country,
      );
    ui.selectedCountry = country;
    render();
  }
  function setQuery(query) {
    ui.query = query;
    render();
  }
  function setNewsMode(mode) {
    ui.newsMode = mode;
    render();
  }
  async function refresh() {
    return research.model().discoverKeywords();
  }
  async function save(path, body, method = "POST") {
    if (!ui.connected) {
      notify("입력을 저장하려면 start.cmd를 실행해 주세요.");
      return;
    }
    ui.busy = true;
    render();
    try {
      await request(path, method, body);
      ui.modal = null;
      draft = [];
      await load();
      notify("이 PC의 데이터베이스에 기록했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      ui.busy = false;
      render();
    }
  }
  function promote(signal) {
    setModal({
      type: "opportunity",
      data: {
        title: sectorOf(signal.category).name + " 사업 기회 검토",
        category: signal.category,
        thesis: signal.implication,
        evidenceIds: [signal.id],
        scores: { fit: 3, demand: 3, economics: 3, moat: 3 },
      },
    });
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { ...state, exportedAt: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "orbital-strategy-records.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function getModel() {
    const seen = new Set();
    const excluded = new Set(state.excludedSignalIds);
    const contextSignals = [
      ...(research.data.result?.articles || []),
      ...state.signals,
    ].filter((signal) => {
      if (seen.has(signal.id)) return false;
      if (excluded.has(signal.id)) return false;
      if (!window.OrbitalResearchCore.isArticleVisible(signal)) return false;
      seen.add(signal.id);
      return true;
    });
    return {
      ...ui,
      state,
      loading: false,
      ...window.OrbitalSelect(
        { ...state, signals: contextSignals },
        ui.sector,
        ui.query,
        ui.newsMode,
        research.data.activeId,
      ),
      ...research.model(),
      setView,
      setSector,
      setSelectedCountry,
      setQuery,
      setNewsMode,
      setModal,
      load,
      refresh,
      save,
      promote,
      download,
      extractKeywords,
      switchView(view) {
        ui.query = "";
        setView(view);
      },
    };
  }
  async function extractKeywords(id) {
    if (ui.busy) return;
    ui.busy = true;
    render();
    try {
      await request("article-analysis", "POST", { id });
      await load();
      const signal = state.signals.find((item) => item.id === id);
      if (ui.modal?.type === "signal" && signal) ui.modal.data = signal;
      notify("자동 원문 수집·요약 대기열에 등록했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      ui.busy = false;
      render();
    }
  }
  function draftState(initial) {
    const index = draftIndex++;
    if (!(index in draft)) draft[index] = initial;
    return [
      draft[index],
      (value) => {
        draft[index] =
          typeof value === "function" ? value(draft[index]) : value;
        render();
      },
    ];
  }
  function render() {
    const modalKey = ui.modal
      ? ui.modal.type + ":" + (ui.modal.data?.id || "new")
      : "";
    // Keep unsaved fields when a score, evidence checkbox or status changes.
    const formValues = new Map();
    if (modalKey && modalKey === renderedModalKey) {
      document
        .querySelectorAll(
          ".modal input[name], .modal select[name], .modal textarea[name]",
        )
        .forEach((field) =>
          formValues.set(field.name, {
            value: field.value,
            checked: field.checked,
          }),
        );
    }
    const active = document.activeElement;
    const focusKey =
      active?.getAttribute("aria-label") || active?.getAttribute("name");
    const position =
      typeof active?.selectionStart === "number" ? active.selectionStart : null;
    if (globe) {
      savedGlobeView = { ...globe.view, playing: globe.playing, resumeAt: globe.resumeAt };
    }
    const shouldFocusGlobe = Boolean(pendingGlobeFocus);
    if (pendingGlobeFocus) {
      savedGlobeView = {
        ...savedGlobeView,
        yaw: -pendingGlobeFocus.lon,
        tilt: Math.max(-55, Math.min(60, pendingGlobeFocus.lat)),
      };
      pendingGlobeFocus = null;
    }
    window.OrbitalUI.beginRender();
    draftIndex = 0;
    const root = document.getElementById("app");
    root.innerHTML = window.OrbitalUI.content(
      window.OrbitalViews.renderDashboard(),
    );
    window.OrbitalUI.hydrate(root);
    root
      .querySelectorAll(
        ".modal input[name], .modal select[name], .modal textarea[name]",
      )
      .forEach((field) => {
        if (formValues.has(field.name)) {
          field.value = formValues.get(field.name).value;
          if (field.type === "checkbox")
            field.checked = formValues.get(field.name).checked;
        }
      });
    renderedModalKey = modalKey;
    const globeRoot = document.getElementById("globe-root");
    if (globeRoot) {
      if (globe) {
        globeRoot.replaceChildren(globe.scene);
        if (shouldFocusGlobe) {
          globe.view.yaw = savedGlobeView.yaw;
          globe.view.tilt = savedGlobeView.tilt;
        }
        globe.update(getModel());
      } else {
        globe = new window.OrbitalGlobe(globeRoot, getModel(), savedGlobeView);
      }
      if (shouldFocusGlobe) globe.pauseForInteraction();
    } else if (globe) {
      globe.destroy();
      globe = null;
    }
    if (focusKey) {
      const next = [...root.querySelectorAll("[aria-label],[name]")].find(
        (element) =>
          (element.getAttribute("aria-label") ||
            element.getAttribute("name")) === focusKey,
      );
      next?.focus({ preventScroll: true });
      if (position !== null && next?.setSelectionRange)
        try {
          next.setSelectionRange(position, position);
        } catch {
          /* Numeric fields have no selection range. */
        }
    }
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.busy) setModal(null);
  });
  function selectLocation(location) {
    setSelectedCountry(
      ui.selectedCountry === location.country ? null : location.country,
    );
  }
  window.OrbitalApp = { getModel, draftState, notify, render, selectLocation };
  render();
  void load();
  setInterval(() => {
    if ((!ui.modal || ui.modal.type === "signal") && !ui.busy) void load();
  }, 10000);
})();
