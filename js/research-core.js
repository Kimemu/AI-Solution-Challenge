/** 날짜·국가 추출·기사 빈도 집계. 브라우저와 서버에서 같은 규칙을 사용합니다. */
(function (root) {
  const config =
    typeof module === "object" && module.exports
      ? require("./research-config")
      : root.OrbitalResearchConfig;
  const { countries, continents, topics } = config;
  const day = 86400000;
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  function dayOf(value) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? dayFormatter.format(parsed) : "";
  }
  function scopeOf(input = {}) {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Seoul",
    });
    const range = ["7", "30", "90", "custom"].includes(String(input.range))
      ? String(input.range)
      : "30";
    const to = range === "custom" ? input.to : today;
    const from =
      range === "custom"
        ? input.from
        : new Date(Date.parse(today) - (+range - 1) * day)
            .toISOString()
            .slice(0, 10);
    for (const date of [from, to]) {
      if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw new Error("올바른 시작일과 종료일을 선택해 주세요.");
    }
    if (
      from > to ||
      Date.parse(to) - Date.parse(from) > 365 * day ||
      to > today
    )
      throw new Error("검색 기간은 오늘까지 최대 1년으로 선택해 주세요.");
    const continent = continents.some((item) => item.id === input.continent)
      ? input.continent
      : "all";
    return { range, from, to, continent };
  }
  function includesTerm(value, term) {
    const haystack = String(value || "").toLocaleLowerCase();
    const needle = String(term || "")
      .trim()
      .toLocaleLowerCase();
    if (!needle) return false;
    if (/^[a-z0-9 .'-]+$/.test(needle)) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i").test(
        haystack,
      );
    }
    return haystack.includes(needle);
  }
  function headline(signal) {
    const title = signal.title || "";
    if (!signal.url?.includes("news.google.com")) return title;
    const source = signal.source?.trim();
    if (source && title.toLowerCase().endsWith(source.toLowerCase()))
      return title
        .slice(0, -source.length)
        .replace(/\s[-–—]\s*$/, "")
        .trim();
    return title.replace(/\s-\s[^-]+$/, "");
  }
  function countryInfo(signal) {
    const title = headline(signal);
    const mentions = countries.filter((country) =>
      country.aliases.some((word) => includesTerm(title, word)),
    );
    if (mentions.length)
      return {
        countryCodes: mentions.map((c) => c.code),
        countryBasis: "title-mention",
      };
    const domain = String(signal.publisherDomain || "")
      .toLowerCase()
      .replace(/^www\./, "");
    const publisher = countries.find((country) =>
      country.outlets.some(
        (outlet) =>
          domain === outlet.domain || domain.endsWith("." + outlet.domain),
      ),
    );
    if (publisher)
      return {
        countryCodes: [publisher.code],
        countryBasis: "publisher-location",
      };
    if (["nasa"].includes(signal.feed))
      return { countryCodes: ["US"], countryBasis: "publisher-location" };
    return { countryCodes: [], countryBasis: "unknown" };
  }
  function enrich(signal) {
    if (signal.countryVersion === 2) return signal;
    return { ...signal, ...countryInfo(signal), countryVersion: 2 };
  }
  function inScope(signal, scope) {
    if (signal.kind !== "news" || signal.articleJob?.status === "failed")
      return false;
    const date = signal.publishedAt ? dayOf(signal.publishedAt) : "";
    if (!date || date < scope.from || date > scope.to) return false;
    return (
      scope.continent === "all" ||
      enrich(signal).countryCodes.some(
        (code) =>
          countries.find((c) => c.code === code)?.continent === scope.continent,
      )
    );
  }
  function articleText(signal) {
    return [
      headline(signal),
      ...(signal.articleAnalysis?.keywords || []),
      ...(signal.keywordAnalysis?.keywords || []),
    ].join(" ");
  }
  function matches(signal, word) {
    const topic = topics.find(
      (item) => item.word.toLowerCase() === word.toLowerCase(),
    );
    if (
      word === "우주" &&
      /living space|office space|parking space|the space in between/i.test(
        headline(signal),
      )
    )
      return false;
    return (topic ? topic.aliases : [word]).some((term) =>
      includesTerm(articleText(signal), term),
    );
  }
  const stop = new Set(
    "the and for with from this that into over after before more than says said will have has new news google reuters times update today latest world business report reports global year years first company companies how why its are was were not out about could would satellite satellites space solar nasa esa 한화 기사 뉴스 구글 뉴스에서 본문 제목 기반 분석 발표 대한 위한 통해 관련 이번 지난해 올해 제공 정보 시장 기업 한국어 요약 결과 한국 미국 today com www all you your what when now launches launch launched unveils announces announced breaking read video photos image get adds set plan plans".split(
      /\s+/,
    ),
  );
  for (const word of "wants want wanted boss chief changes change country audio october november september august july june january february march april may december latest head headlines coverage story stories newness give gives going goes says asks tells sees shows show million billion next last still ahead amid back look looks top most big increase rise rising using during over under through around without need needs".split(
    /\s+/,
  ))
    stop.add(word);
  function recommend(signals, scope) {
    const corpus = signals.filter((signal) => inScope(signal, scope));
    const noise = new Set([
      ...stop,
      ...countries
        .flatMap((country) => [
          country.name,
          country.mapName,
          ...country.aliases.filter(
            (word) => !/NASA|SpaceX|Hanwha|ISRO|CNES/i.test(word),
          ),
          ...country.outlets.flatMap((outlet) => outlet.name.split(/\s+/)),
        ])
        .map((word) => word.toLowerCase()),
    ]);
    const candidates = new Map();
    const add = (word, id) => {
      const key = word.toLowerCase();
      if (!candidates.has(key)) candidates.set(key, { word, ids: new Set() });
      candidates.get(key).ids.add(id);
    };
    for (const signal of corpus) {
      for (const topic of topics)
        if (matches(signal, topic.word)) add(topic.word, signal.id);
      const terms = new Set([
        ...(signal.articleAnalysis?.keywords || []),
        ...(headline(signal).match(/[\p{L}][\p{L}\p{N}-]{2,26}/gu) || []),
      ]);
      for (const term of terms) {
        const word = term.trim();
        if (
          word.length > 40 ||
          noise.has(word.toLowerCase()) ||
          /^\d/.test(word) ||
          topics.some((topic) =>
            topic.aliases.some(
              (alias) => alias.trim().toLowerCase() === word.toLowerCase(),
            ),
          )
        )
          continue;
        add(word, signal.id);
      }
    }
    return {
      total: corpus.length,
      keywords: [...candidates.values()]
        .filter(
          ({ word, ids }) =>
            ids.size >= (corpus.length > 5 ? 2 : 1) ||
            topics.some((topic) => topic.word === word),
        )
        .map(({ word, ids }) => ({
          word,
          count: ids.size,
          percentage: Math.round((ids.size / Math.max(1, corpus.length)) * 100),
        }))
        .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "ko"))
        .slice(0, 18),
    };
  }
  function countryCounts(signals) {
    const enriched = signals.map(enrich);
    return countries
      .map((country) => ({
        ...country,
        count: enriched.filter((signal) =>
          signal.countryCodes.includes(country.code),
        ).length,
      }))
      .filter((country) => country.count > 0)
      .sort((a, b) => b.count - a.count);
  }
  function stageFor(score, gates = config.gates) {
    if (score >= gates.approved) return "approved";
    if (score >= gates.pilot) return "pilot";
    if (score >= gates.diligence) return "diligence";
    return "watch";
  }
  const core = {
    scopeOf,
    dayOf,
    includesTerm,
    headline,
    countryInfo,
    enrich,
    inScope,
    articleText,
    matches,
    recommend,
    countryCounts,
    stageFor,
  };
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.OrbitalResearchCore = core;
})(typeof window === "undefined" ? globalThis : window);
