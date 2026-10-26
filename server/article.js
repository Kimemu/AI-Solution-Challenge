/** 공개 기사 HTML을 가져와 본문을 추출합니다. 내부망 요청과 과도한 응답은 거절합니다. */
const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns/promises");
const { decode } = require("./signals");

function publicAddress(address) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
async function download(address, options = {}, hops = 0) {
  const url = new URL(address);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("공개 HTTP/HTTPS 기사 주소만 수집할 수 있습니다.");
  const records = await dns.lookup(url.hostname, { family: 4, all: true });
  if (
    !records.length ||
    records.some((record) => !publicAddress(record.address))
  )
    throw new Error("내부망 주소의 원문 수집은 허용하지 않습니다.");
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: options.body ? "POST" : "GET",
        headers: {
          // 일부 공개 언론사도 비브라우저 UA를 차단하므로 일반 브라우저 요청을 사용합니다.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
          "Accept-Encoding": "identity",
          ...options.headers,
        },
        // 검증한 DNS 결과로 연결하여 검증 후 내부 주소로 바뀌는 것을 막습니다.
        lookup: (_host, lookupOptions, callback) =>
          lookupOptions.all
            ? callback(null, [records[0]])
            : callback(null, records[0].address, 4),
      },
      (incoming) => {
        const chunks = [];
        let length = 0;
        incoming.on("data", (chunk) => {
          length += chunk.length;
          if (length > 4000000)
            request.destroy(new Error("원문 HTML이 4MB를 초과합니다."));
          else chunks.push(chunk);
        });
        incoming.on("error", reject);
        incoming.on("end", () =>
          resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            data: Buffer.concat(chunks),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("원문 서버 응답 시간이 초과되었습니다.")),
      20000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(options.body);
  });
  if (
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.location
  ) {
    if (hops >= 5) throw new Error("원문 주소의 리디렉션이 너무 많습니다.");
    if (options.body)
      throw new Error("원문 주소 해석 요청이 리디렉션되었습니다.");
    return download(new URL(response.headers.location, url).href, {}, hops + 1);
  }
  if (response.status !== 200) {
    const detail =
      response.status === 401 || response.status === 403
        ? "언론사 사이트가 자동 수집 요청을 거부했습니다"
        : "원문 서버가 요청을 처리하지 못했습니다";
    throw new Error(`${detail} (${url.hostname}, HTTP ${response.status})`);
  }
  if (
    response.headers["content-encoding"] &&
    response.headers["content-encoding"] !== "identity"
  )
    throw new Error("지원하지 않는 원문 압축 형식입니다.");
  const type = response.headers["content-type"] || "";
  const prefix = response.data.subarray(0, 2000).toString();
  const charset =
    type.match(/charset=["']?([^\s;"']+)/i)?.[1] ||
    prefix.match(/charset=["']?([^\s;"'<>]+)/i)?.[1] ||
    "utf-8";
  let text;
  try {
    text = new TextDecoder(charset).decode(response.data);
  } catch {
    text = response.data.toString("utf8");
  }
  return { text, url: url.href, type };
}

// Google News 공개 링크 해석 프로토콜 참고: SSujitX/google-news-url-decoder (MIT).
async function resolveGoogle(url, html, request = download) {
  const id = new URL(url).pathname.split("/").pop();
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="(\d+)"/)?.[1];
  if (!id || !signature || !timestamp)
    throw new Error("Google News에서 언론사 원문 주소를 확인하지 못했습니다.");
  const context = [
    [
      "X",
      "X",
      ["X", "X"],
      null,
      null,
      1,
      1,
      "US:en",
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      0,
      1,
    ],
    "X",
    "X",
    1,
    [1, 1, 1],
    1,
    1,
    null,
    0,
    0,
    null,
    0,
  ];
  const inner = ["garturlreq", context, id, Number(timestamp), signature];
  const body = new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(inner), null, "0"]]]),
  }).toString();
  const result = await request(
    "https://news.google.com/_/DotsSplashUi/data/batchexecute",
    {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    },
  );
  for (const line of result.text.split("\n")) {
    if (!line.startsWith("[")) continue;
    try {
      for (const row of JSON.parse(line)) {
        if (row[0] === "wrb.fr" && row[1] === "Fbv4je") {
          const payload = JSON.parse(row[2]);
          if (payload[0] === "garturlres" && /^https?:\/\//.test(payload[1]))
            return payload[1];
        }
      }
    } catch {
      /* 길이 프레임이나 다른 RPC 행은 건너뜁니다. */
    }
  }
  throw new Error("Google News 원문 주소 해석에 실패했습니다.");
}

function extractText(html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|nav|header|footer|aside|form|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    );
  // 구조화된 기사 본문이 있으면 페이지 메뉴 대신 이를 우선합니다.
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const walk = (node) => {
        if (!node || typeof node !== "object") return "";
        if (
          typeof node.articleBody === "string" &&
          node.articleBody.length > 300
        )
          return decode(node.articleBody);
        for (const value of Object.values(node)) {
          const found = walk(value);
          if (found) return found;
        }
        return "";
      };
      const text = walk(JSON.parse(match[1]));
      if (text) return text;
    } catch {
      /* 잘못된 JSON-LD는 HTML 본문 추출로 진행합니다. */
    }
  }
  const articles = [
    ...clean.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi),
  ].map((m) => m[1]);
  const paragraphText = (region) =>
    [
      ...new Set(
        [...region.matchAll(/<(p|h[1-4])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
          .map((match) => decode(match[2]))
          .filter((text) => text.length >= 25),
      ),
    ].join("\n\n");
  // CMS마다 article 태그 없이 본문 컨테이너를 쓰므로 흔한 본문 클래스도 검사합니다.
  const containers = [
    ...clean.matchAll(
      /<(div|section)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
    ),
  ]
    .filter((match) =>
      /(?:article|story|entry|post|news|content)[-_ ]?(?:body|content|text|main)|(?:body|content|text)[-_ ]?(?:article|story|entry|post|news)/i.test(
        match[2],
      ),
    )
    .map((match) => match[3]);
  const main = clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const candidates = [articles, containers, main ? [main] : [], [clean]];
  let text = "";
  for (const group of candidates) {
    text = group.map(paragraphText).sort((a, b) => b.length - a.length)[0] || "";
    if (text.length >= 300) break;
  }
  if (text.length < 300)
    throw new Error(
      "충분한 기사 본문을 찾지 못했습니다. 로그인·유료벽·JavaScript 페이지일 수 있습니다.",
    );
  return text;
}

async function crawlArticle(url, request = download) {
  let page = await request(url);
  if (new URL(page.url).hostname === "news.google.com")
    page = await request(await resolveGoogle(url, page.text, request));
  const hostname = new URL(page.url).hostname;
  if (
    /\b(?:instagram|facebook|tiktok|twitter)\.com$/i.test(hostname) ||
    /(?:^|\.)x\.com$/i.test(hostname)
  )
    throw new Error(`SNS 게시물은 기사 본문으로 수집할 수 없습니다 (${hostname}).`);
  if (!/text\/html|application\/xhtml/i.test(page.type))
    throw new Error(`원문이 HTML 기사가 아닙니다 (${hostname}).`);
  let fullText;
  try {
    fullText = extractText(page.text);
  } catch (error) {
    if (/본문/.test(error.message))
      throw new Error(
        `기사 본문을 추출하지 못했습니다 (${hostname}). 로그인·유료벽·JavaScript 페이지일 수 있습니다.`,
      );
    throw error;
  }
  if (fullText.length < 300)
    throw new Error("기사 본문이 너무 짧아 자동 요약하지 않았습니다.");
  if (fullText.length > 100000)
    throw new Error("원문이 100,000자를 초과해 자동 요약하지 않았습니다.");
  return {
    fullText,
    resolvedUrl: page.url,
    fetchedAt: new Date().toISOString(),
  };
}
module.exports = { crawlArticle, extractText, publicAddress, resolveGoogle };
