/** 공개 RSS 파싱과 기사별 분류·정규화를 담당합니다. */
const { sectorOf, sourceFeeds } = require("../js/config");
const { now } = require("./utils");
const { safeUrl, text } = require("./validation");
const { enrich } = require("../js/research-core");
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
  if (
    /methane|emission|greenhouse gas|carbon capture|메탄|탄소|배출|climate/.test(
      s,
    )
  )
    return "emissions";
  if (
    /maritime|shipping|\bports?\b|vessel|ocean security|해양|항만|선박/.test(s)
  )
    return "maritime";
  if (
    /photovoltaic|qcells|solar|irradiance|renewable|energy|battery|태양광|에너지|배터리/.test(
      s,
    )
  )
    return "solar";
  if (/insar|subsidence|ground motion|infrastructure/.test(s))
    return "infrastructure";
  if (/crop|agricultur|soil moisture|food security|farmer|농업|작황/.test(s))
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
// Google News RSS feed result counts vary by category. Keep a practical ceiling
// while allowing current RSS results to determine the number actually stored.
const MAX_ITEMS_PER_SOURCE = 20;
async function normalizeSignal(feed, raw, includeSummaryEntities = false) {
  const title = text(raw.title, 350);
  const url = safeUrl(raw.url);
  if (!title || !url) return null;
  const publisherDomain = safeUrl(raw.sourceUrl)
    ? new URL(raw.sourceUrl).hostname.replace(/^www\./, "")
    : feed.official
      ? new URL(feed.url).hostname.replace(/^www\./, "")
      : "";
  if (
    feed.outlets &&
    !feed.outlets.some(
      (outlet) =>
        publisherDomain === outlet.domain ||
        publisherDomain.endsWith("." + outlet.domain),
    )
  )
    return null;
  const published = Date.parse(text(raw.publishedAt));
  if (Number.isFinite(published) && published > Date.now() + 86400000)
    return null;
  const category = classify(title, feed.category);
  const summary = feed.official
    ? text(raw.summary, 330)
    : "Google News 피드에는 제목·매체·링크만 포함되어 있습니다. 기사 세부 내용은 제공되지 않습니다.";
  return enrich({
    id: await hash(url),
    title,
    url,
    source: text(raw.source, 160) || feed.name,
    feed: feed.id,
    publisherDomain,
    official: feed.official,
    kind: "news",
    category,
    summary,
    ...(feed.official ? { feedExcerpt: text(raw.summary, 8000) } : {}),
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
  });
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
          sourceUrl: decode(
            (block.match(/<source\s[^>]*url=["']([^"']+)["']/i) || [])[1] || "",
          ),
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
