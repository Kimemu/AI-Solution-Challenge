/** 상태 변경과 서버 요청을 관리합니다. 화면 HTML은 views.js에 있습니다. */
(function () {
  const { sectorOf } = window.OrbitalConfig;
  const apiBase = location.protocol === "file:" ? "http://127.0.0.1:8001" : "";
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
    signals: window.OrbitalNews,
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
    if (!response.ok)
      throw new Error(result.error || "요청을 처리하지 못했습니다.");
    return result;
  }
  async function load() {
    const current = ++requestId;
    try {
      const result = await request("state");
      if (current !== requestId) return;
      Object.assign(state, result);
      ui.connected = true;
      ui.error = "";
      render();
    } catch {
      if (current !== requestId) return;
      ui.connected = false;
      ui.error =
        "저장된 뉴스로 화면을 미리 보는 중입니다. 실제 수집·저장은 start.cmd를 실행한 뒤 사용할 수 있습니다.";
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
  }
  function setSector(sector) {
    ui.sector = sector;
    render();
  }
  function setSelectedCountry(country) {
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
    if (!ui.connected) {
      notify("start.cmd를 실행해 백엔드를 먼저 연결해 주세요.");
      return;
    }
    ui.refreshing = true;
    render();
    try {
      const result = await request("refresh", "POST");
      await load();
      notify(
        result.throttled
          ? result.message
          : `신규 ${result.added}건 수집 · ${result.status === "success" ? "모든 피드 정상" : result.status === "partial" ? "일부 피드 연결 확인 필요" : "수집 실패"}`,
      );
    } catch (error) {
      notify(error.message);
    } finally {
      ui.refreshing = false;
      render();
    }
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
    return {
      ...ui,
      state,
      loading: false,
      ...window.OrbitalSelect(state, ui.sector, ui.query, ui.newsMode),
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
      switchView(view) {
        ui.query = "";
        setView(view);
      },
    };
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
        .forEach((field) => formValues.set(field.name, field.value));
    }
    const active = document.activeElement;
    const focusKey =
      active?.getAttribute("aria-label") || active?.getAttribute("name");
    const position =
      typeof active?.selectionStart === "number" ? active.selectionStart : null;
    if (globe) {
      savedGlobeView = { ...globe.view, playing: globe.playing };
      globe.destroy();
      globe = null;
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
        if (formValues.has(field.name))
          field.value = formValues.get(field.name);
      });
    renderedModalKey = modalKey;
    if (document.getElementById("globe-root"))
      globe = new window.OrbitalGlobe(
        document.getElementById("globe-root"),
        getModel(),
        savedGlobeView,
      );
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
    ui.selectedCountry =
      ui.selectedCountry === location.country ? null : location.country;
    if (location.sector)
      ui.sector = ui.sector === location.sector ? "all" : location.sector;
    render();
  }
  window.OrbitalApp = { getModel, draftState, notify, render, selectLocation };
  render();
  void load();
  setInterval(() => {
    if (!ui.modal && !ui.busy) void load();
  }, 60000);
})();
