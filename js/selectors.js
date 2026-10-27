// 화면 집계·검색: 서버 요청이나 화면 수정을 하지 않는 순수 함수입니다.
(function () {
  const { sectors } = window.OrbitalConfig;
  function selectDashboard(state, sector, query, newsMode, researchId) {
    const records = state?.records ?? [];
    const signals = (state?.signals ?? []).filter(
      window.OrbitalResearchCore.isArticleVisible,
    );
    const scoped = records.filter(
      (record) => !researchId || record.researchId === researchId,
    );
    const opportunities = scoped.filter(
      (record) =>
        record.kind === "opportunity" &&
        !record.sample &&
        (!record.excluded || record.userEdited),
    );
    const assumptions = scoped.filter(
      (record) =>
        record.kind === "assumption" && (!record.excluded || record.userEdited),
    );
    const decisions = scoped.filter(
      (record) =>
        record.kind === "decision" && (!record.excluded || record.userEdited),
    );
    const performances = scoped.filter(
      (record) => record.kind === "performance",
    );
    const news = [...signals].sort((a, b) =>
      (b.publishedAt || b.collectedAt).localeCompare(
        a.publishedAt || a.collectedAt,
      ),
    );
    const needle = query.toLowerCase();
    const filtered = news.filter(
      (signal) =>
        (sector === "all" || signal.category === sector) &&
        (!needle ||
          `${signal.title} ${signal.summary} ${signal.source} ${(signal.entities || []).join(" ")}`
            .toLowerCase()
            .includes(needle)) &&
        (newsMode === "all" ||
          (newsMode === "official"
            ? signal.official
            : newsMode === "verified"
              ? signal.reviewed
              : signal.kind === "news")),
    );
    const counts = Object.fromEntries(
      sectors.map((item) => [
        item.id,
        signals.filter((signal) => signal.category === item.id).length,
      ]),
    );
    const lastRun = state?.runs[0];
    const schedule = records.find((record) => record.kind === "schedule");
    const official = signals.filter((signal) => signal.official).length;
    const realOpps = opportunities.filter((opportunity) => !opportunity.sample);
    const amounts = realOpps.filter(
      (opportunity) => opportunity.amount !== null,
    );
    const amount = amounts.reduce(
      (total, opportunity) => total + (opportunity.amount ?? 0),
      0,
    );
    const progressCounts = {
      collect: signals.length,
      verify: signals.filter((signal) => signal.reviewed).length,
      knowledge: signals.length,
      analysis: opportunities.length,
      review: opportunities.filter((opportunity) =>
        ["diligence", "pilot"].includes(opportunity.stage),
      ).length,
      decide: decisions.length,
      feedback: performances.length,
    };
    const progressCount = (id) => progressCounts[id] ?? 0;
    return {
      records,
      signals,
      opportunities,
      assumptions,
      decisions,
      performances,
      news,
      filtered,
      counts,
      lastRun,
      schedule,
      official,
      realOpps,
      amounts,
      amount,
      progressCount,
    };
  }
  window.OrbitalSelect = selectDashboard;
})();
