/** 국가별 주요 매체 5곳을 Google News의 site 검색으로 조회합니다. */
const { sourceFeeds } = require("../js/config");
const { countries, topics } = require("../js/research-config");
function dateQuery(scope) {
  const next = new Date(Date.parse(scope.to) + 86400000)
    .toISOString()
    .slice(0, 10);
  return `after:${scope.from} before:${next}`;
}
function searchUrl(q, country) {
  const language = country?.language || "en";
  return (
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q,
      hl: language === "en" ? "en-US" : language,
      gl: country?.code || "US",
      ceid: `${country?.code || "US"}:${language === "pt-BR" || language === "pt-PT" ? "pt" : language === "zh-CN" ? "zh-Hans" : language}`,
    })
  );
}
const localTopics = {
  ko: "위성 OR 우주 OR 태양광 OR 에너지 OR 해양 OR 인공지능",
  ja: "衛星 OR 宇宙 OR 太陽光 OR エネルギー OR 人工知能",
  "zh-CN": "卫星 OR 航天 OR 太阳能 OR 能源 OR 人工智能",
  "zh-Hant": "衛星 OR 太空 OR 太陽能 OR 能源 OR 人工智慧",
  de: "Satellit OR Raumfahrt OR Solarenergie OR Energie",
  fr: "satellite OR spatial OR solaire OR énergie",
  es: "satélite OR espacial OR solar OR energía",
  "pt-BR": "satélite OR espacial OR solar OR energia",
  "pt-PT": "satélite OR espacial OR solar OR energia",
  ru: "спутник OR космос OR энергетика",
  ar: "الأقمار الصناعية OR الطاقة OR الفضاء",
};
function feedsFor(scope, keyword = "") {
  const selected = countries.filter(
    (country) =>
      scope.continent === "all" || country.continent === scope.continent,
  );
  const topic = topics.find((item) => item.word === keyword);
  const globalQuery = keyword
    ? `(${(topic?.aliases || [keyword]).map((term) => '"' + term.trim().replaceAll('"', "") + '"').join(" OR ")})`
    : '(satellite OR spacecraft OR "space industry" OR rocket OR solar OR methane OR energy OR maritime OR agriculture)';
  const original = sourceFeeds.map((feed) => {
    if (feed.official) return feed;
    const q = new URL(feed.url).searchParams
      .get("q")
      .replace(/when:\d+[dmy]/g, "");
    return {
      ...feed,
      url: searchUrl(`${keyword ? globalQuery : q} ${dateQuery(scope)}`),
    };
  });
  return [
    ...original,
    ...selected.map((country) => ({
      id: "country-" + country.code,
      name: country.name + " · 주요 매체 5곳",
      category: "space",
      official: false,
      countryCode: country.code,
      outlets: country.outlets,
      url: searchUrl(
        `(${country.outlets.map((outlet) => "site:" + outlet.domain).join(" OR ")}) ${keyword ? globalQuery : `(${globalQuery.slice(1, -1)}${localTopics[country.language] ? " OR " + localTopics[country.language] : ""})`} ${dateQuery(scope)}`,
        country,
      ),
    })),
  ];
}
async function collectFeeds(feeds, fetcher, progress = () => {}) {
  const signals = [],
    details = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, feeds.length) }, async () => {
      while (cursor < feeds.length) {
        const feed = feeds[cursor++];
        try {
          const items = await fetcher(feed);
          signals.push(...items);
          details.push({
            id: feed.id,
            name: feed.name,
            status: "ok",
            count: items.length,
            countryCode: feed.countryCode || null,
          });
        } catch (error) {
          details.push({
            id: feed.id,
            name: feed.name,
            status: "error",
            count: 0,
            error: String(error.message).slice(0, 180),
            countryCode: feed.countryCode || null,
          });
        }
        await progress({
          done: details.length,
          total: feeds.length,
          latest: details.at(-1),
          details: [...details],
        });
      }
    }),
  );
  return {
    signals: [
      ...new Map(signals.map((signal) => [signal.id, signal])).values(),
    ],
    details,
  };
}
module.exports = { feedsFor, collectFeeds, dateQuery };
