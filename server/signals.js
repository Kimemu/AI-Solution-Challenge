/** 공개 RSS 파싱과 기사별 분류·정규화를 담당합니다. */
const { sectorOf, sourceFeeds } = require("../js/config");
const { now } = require("./utils");
const { safeUrl, text } = require("./validation");
function analysis(category) {
  const s = sectorOf(category);
  return {
    implication: s.implication,
    uncertainty: s.check,
    affiliate: s.affiliate,
    analysisMethod: "분야별 규칙 기반 사업 가설 · 투자 권고 아님",
  };
}
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const v = Number(n);
      return v <= 0x10ffff ? String.fromCodePoint(v) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}
function tag(block, name) {
  const m = block.match(
    new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"),
  );
  return m ? decode(m[1]) : "";
}
function classify(title, fallback) {
  const s = title.toLowerCase();
  if (/methane|emission|carbon capture/.test(s)) return "emissions";
  if (/maritime|ship|port |vessel|ocean security/.test(s)) return "maritime";
  if (/photovoltaic|qcells|solar power|irradiance|renewable/.test(s))
    return "solar";
  if (/insar|subsidence|ground motion|infrastructure/.test(s))
    return "infrastructure";
  if (/crop|agricultur|soil moisture|food security/.test(s))
    return "agriculture";
  return sectorOf(fallback).id;
}
function entities(s) {
  return [
    "Hanwha",
    "Qcells",
    "NASA",
    "ESA",
    "ICEYE",
    "Planet",
    "GHGSat",
    "Solcast",
    "Airbus",
    "SpaceX",
    "Copernicus",
    "Sentinel",
    "SAR",
    "InSAR",
    "AIS",
    "methane",
    "solar",
    "FCC",
    "ITU",
    "3GPP",
    "spectrum",
  ].filter((x) => s.toLowerCase().includes(x.toLowerCase()));
}
async function hash(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h))
    .slice(0, 12)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const MAX_ITEMS_PER_SOURCE = 8;
async function normalizeSignal(feed, raw, includeSummaryEntities = false) {
  const title = text(raw.title, 350);
  const url = safeUrl(raw.url);
  if (!title || !url) return null;
  const published = Date.parse(text(raw.publishedAt));
  if (Number.isFinite(published) && published > Date.now() + 86400000)
    return null;
  const category = classify(title, feed.category);
  const summary = feed.official
    ? text(raw.summary, 330)
    : "검색 피드에서 수집한 제목입니다. 기사 본문과 계약·금액·일정은 원문에서 추가 확인이 필요합니다.";
  return {
    id: await hash(url),
    title,
    url,
    source: text(raw.source, 160) || feed.name,
    feed: feed.id,
    official: feed.official,
    kind: "news",
    category,
    summary,
    publishedAt: Number.isFinite(published)
      ? new Date(published).toISOString()
      : null,
    collectedAt: now(),
    verification: feed.official
      ? "공식 피드 · 본문 미검증"
      : "뉴스 제목 수집 · 미검증",
    entities: entities(includeSummaryEntities ? title + " " + summary : title),
    signalType: /regulat|license|spectrum|standard/i.test(title)
      ? "정책·규제"
      : /contract|funding|acqui|investment|merger/i.test(title)
        ? "계약·투자"
        : "기술·시장",
    ...analysis(category),
  };
}
async function getFeed(feed) {
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": "ORBITAL-Strategy-Research/2.0",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const raw = await response.text();
  if (raw.length > 1_500_000) throw new Error("피드 크기 초과");
  const blocks = raw.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  if (!blocks.length && !/<rss|<channel/i.test(raw))
    throw new Error("유효한 RSS 응답이 아닙니다.");
  const signals = await Promise.all(
    blocks.slice(0, MAX_ITEMS_PER_SOURCE).map((block) =>
      normalizeSignal(
        feed,
        {
          title: tag(block, "title"),
          url: tag(block, "link"),
          publishedAt: tag(block, "pubDate"),
          summary: tag(block, "description"),
          source: tag(block, "source"),
        },
        true,
      ),
    ),
  );
  return signals.filter((signal) => signal !== null);
}

module.exports = {
  analysis,
  decode,
  tag,
  classify,
  entities,
  hash,
  MAX_ITEMS_PER_SOURCE,
  normalizeSignal,
  getFeed,
};
