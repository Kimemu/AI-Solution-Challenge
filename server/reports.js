/** 편집한 DB 자료로 결재용 HTML·PDF를 생성합니다. 실행 시 별도 패키지가 필요 없습니다. */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { db, rowData } = require("./database");
const { countries, templateSources } = require("../js/research-config");
const { enrich, dayOf, headline } = require("../js/research-core");
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const won = (value) => Number(value || 0).toLocaleString("ko-KR") + "원";
const stageName = (stage) =>
  ({
    watch: "기회 발굴",
    diligence: "투자검토 제안",
    pilot: "PoC 제안",
    approved: "추진 제안",
    hold: "보류",
    rejected: "종료",
  })[stage] || stage;
function reportData(id) {
  const row = db()
    .prepare("SELECT * FROM records WHERE id=? AND kind='report'")
    .bind(id)
    .first();
  if (!row) throw new Error("보고서를 찾을 수 없습니다.");
  const report = rowData(row);
  const session = JSON.parse(
    db()
      .prepare("SELECT data FROM records WHERE id=? AND kind='research'")
      .bind(report.researchId)
      .first()?.data || "{}",
  );
  const related = db()
    .prepare(
      "SELECT * FROM records WHERE json_extract(data,'$.researchId')=? ORDER BY updated_at DESC",
    )
    .bind(report.researchId)
    .all()
    .results.map(rowData);
  const ideas = related
    .filter(
      (record) =>
        record.kind === "opportunity" &&
        !record.excluded &&
        !record.excludeFromReport,
    )
    .sort((a, b) => b.score - a.score);
  const evidenceIds = new Set(ideas.flatMap((idea) => idea.evidenceIds || []));
  const evidence = db()
    .prepare("SELECT data FROM signals")
    .all()
    .results.map((row) => enrich(JSON.parse(row.data)))
    .filter((signal) => evidenceIds.has(signal.id))
    .map(
      ({
        id,
        title,
        source,
        url,
        publishedAt,
        countryCodes,
        countryBasis,
        articleAnalysis,
        articleContent,
      }) => ({
        id,
        title,
        source,
        url: articleContent?.resolvedUrl || articleAnalysis?.resolvedUrl || url,
        publishedAt,
        countryCodes,
        countryBasis,
        analysisBasis: articleAnalysis?.analysisBasis,
      }),
    );
  return {
    report,
    session,
    ideas,
    assumptions: related.filter(
      (record) => record.kind === "assumption" && !record.excluded,
    ),
    decisions: related.filter((record) => record.kind === "decision"),
    evidence,
  };
}
function printHtml(id) {
  const { report: r, session, ideas, assumptions, evidence } = reportData(id);
  const lines = (value) => `<p>${escape(value)}</p>`;
  const section = (title, value) =>
    `<section><h2>${escape(title)}</h2>${lines(value)}</section>`;
  const focus =
    ideas.find((idea) => idea.id === r.focusOpportunityId) || ideas[0];
  const rows = r.budget.items
    .map(
      (item) =>
        `<tr><td>${escape(item.label)}</td><td>${escape(item.quantity)} ${escape(item.unit)}</td><td class="number">${won(item.unitCost)}</td><td class="number">${won(item.subtotal)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.title)}</title><style>
    @page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font:12px/1.65 'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#18202c;background:#fff;margin:0 auto;max-width:850px;padding:24px}h1{font-size:25px;letter-spacing:-1px;line-height:1.4;margin:10px 0 22px}h2{font-size:14px;padding-bottom:6px;border-bottom:1px solid #bdc7d4;margin:23px 0 10px;break-after:avoid}h3{font-size:12px;margin:15px 0 4px;break-after:avoid}p{white-space:pre-line;overflow-wrap:anywhere;margin:8px 0}a{color:#124c9a;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:11px;table-layout:fixed}td,th{border:1px solid #cbd2dc;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f4f8;font-weight:600}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr{break-inside:avoid}thead{display:table-header-group}.eyebrow{font-size:9px;color:#596b81;letter-spacing:2px}.meta{display:flex;justify-content:space-between;gap:20px;color:#596579;border-bottom:2px solid #1c2c42;padding-bottom:10px}.summary{border:1px solid #b9cae4;border-left:4px solid #1967c4;background:#f5f8fd;padding:15px}.budget-total{font-size:17px;text-align:right;font-weight:bold}.note{font-size:10px;color:#606b7a}.approval td{height:60px}.evidence li{margin:9px 0;break-inside:avoid}.toolbar{display:flex;justify-content:space-between;align-items:center;background:#eff4ff;padding:12px;margin-bottom:30px}.toolbar button{background:#1768c5;color:white;border:0;border-radius:6px;padding:10px 18px;cursor:pointer}.footer{border-top:1px solid #ccd3df;padding-top:10px;margin-top:12px;font-size:9px;color:#65738a}@media print{body{padding:0;max-width:none}.toolbar{display:none}a{text-decoration:none}.summary,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}section{break-inside:auto}}
    </style></head><body><div class="toolbar"><span>최종보고서 · 편집 내용이 반영된 결재용 초안</span><button onclick="window.print()">인쇄 / PDF 저장</button></div>
    <div class="eyebrow">ORBITAL / BUSINESS PROPOSAL</div><h1>${escape(r.title)}</h1><div class="meta"><span>${escape(r.department)} · ${escape(r.author)}</span><span>작성일 ${escape(r.createdAt?.slice(0, 10))} · 결재 전 초안</span></div>
    <table class="approval"><tr><th>기안</th><th>검토</th><th>결재</th></tr><tr><td>${escape(r.author)}<br>작성 완료 · 승인 전</td><td>${escape(r.reviewer)}<br>검토 대기</td><td>${escape(r.approver)}<br>결재 대기</td></tr></table>
    <div class="summary"><b>결재 요청사항</b>${lines(r.request)}<b>권고 최소 PoC 예산 ${r.budgetStatus === "pending" ? "산정 보류" : won(r.budget.total)}</b><br><span class="note">${escape(r.budget.basis)}</span></div>
    ${section("1. 검토 요약", r.executive)}
    ${section("2. 사업 필요성과 목표 · Strategic case", r.strategic)}
    <p class="note">검색 키워드: ${escape(session.keyword)} · 기간 ${escape(session.scope?.from)} ~ ${escape(session.scope?.to)} · ${session.articleCount || 0}개 기사. 기사 관심 빈도는 실제 구매수요의 증거로 확정하지 않습니다.</p>
    <h2>3. 사업 아이디어와 단계별 평가</h2><table><thead><tr><th style="width:36%">사업 아이디어</th><th>점수 / 단계</th><th>연결 근거</th><th>PoC 예산 가정</th></tr></thead><tbody>${ideas.map((idea) => `<tr><td>${escape(idea.title)}</td><td>${idea.score}점<br>${escape(stageName(idea.stage))}</td><td>${idea.evidenceIds.length}건</td><td class="number">${won(idea.budget?.total || idea.amount * 1e8)}</td></tr>`).join("")}</tbody></table>
    ${ideas
      .map(
        (idea) =>
          `<h3>${escape(idea.title)}</h3>${lines(idea.thesis)}<p class="note">${escape(idea.scoringMethod || "내부 점수")}<br>${Object.entries(
            idea.scoreReasons || {},
          )
            .map(
              ([key, reason]) =>
                `${escape(key)} ${idea.scores[key]}/5: ${escape(reason)}`,
            )
            .join(
              "<br>",
            )}<br>${(idea.gateTrace || []).map((gate) => `${escape(stageName(gate.stage))} ${gate.threshold}점 이상: ${gate.passed ? "충족" : "미달"}`).join(" · ")}</p>`,
      )
      .join("")}
    ${section("4. 대안 비교와 기대효과 · Economic case", r.economic)}
    ${section("5. 고객·수익모델·조달 · Commercial case", r.commercial)}
    <section><h2>6. 최소 PoC 예산 · Financial case</h2><p>우선안: ${escape(focus?.title)}. 아래 예산은 이 안건 1개의 PoC 기준입니다.</p><table><colgroup><col style="width:38%"><col style="width:14%"><col style="width:24%"><col style="width:24%"></colgroup><thead><tr><th>항목</th><th>수량</th><th>계획 단가</th><th>금액</th></tr></thead><tbody>${rows}<tr><td colspan="3">소계</td><td class="number">${won(r.budget.subtotal)}</td></tr><tr><td colspan="3">예비비 ${r.budget.reservePercent}%</td><td class="number">${won(r.budget.reserve)}</td></tr></tbody></table><div class="budget-total">합계 ${r.budgetStatus === "pending" ? "산정 보류" : won(r.budget.total)}</div>${lines(r.budget.assumptions)}<p class="note">계획 단가는 내부 가정이며 시장 견적·확정 지출이 아닙니다. ROI와 매출 전망은 고객·가격 확인 후 작성합니다.</p></section>
    ${section("7. 추진 일정과 책임 · Management case", r.management)}
    <h2>8. 성과 지표와 검증 계획</h2><table><thead><tr><th>관련 안건 / 지표</th><th>목표</th><th>실적</th><th>확인 기한</th></tr></thead><tbody>${assumptions.map((a) => `<tr><td>${escape(ideas.find((idea) => idea.id === a.opportunityId)?.title)}<br>${escape(a.title)}</td><td>${escape(a.target)} ${escape(a.unit)}</td><td>${a.actual === null ? "측정 전" : escape(a.actual) + " " + escape(a.unit)}</td><td>${escape(a.dueDate)}</td></tr>`).join("")}</tbody></table>
    ${section("9. 위험요인과 대응", r.risks)}
    <h2>10. 근거 기사</h2><ol class="evidence">${evidence.map((article) => `<li><b>${escape(headline(article))}</b><br>${escape(article.source)} · ${escape(article.publishedAt ? dayOf(article.publishedAt) : "발행일 미표기")} · ${escape((article.countryCodes || []).map((code) => countries.find((country) => country.code === code)?.name || code).join(", ") || "국가 미확인")}<br><a href="${escape(article.url)}">원문 기사 보기 · ${escape(new URL(article.url).hostname)}</a><br><span class="note">${article.analysisBasis === "google-news-headline" ? "Google News 제목 기반 요약" : article.analysisBasis === "rss-excerpt" ? "RSS 제공 발췌 기반" : "공개 기사 본문 기반 요약"} · ${article.countryBasis === "publisher-location" ? "국가는 매체 소재지 기준" : "국가는 제목 언급 기준"}</span></li>`).join("")}</ol>
    <h2>보고서 양식 참고</h2>${templateSources.map((source) => `<a href="${escape(source.url)}">${escape(source.name)}</a>`).join(" · ")}<div class="footer">ORBITAL · 자동 생성 후 사용자 편집 가능한 검토 초안. 자동 단계 분류는 최종 결재를 의미하지 않습니다. 수익·실적이 확인되지 않은 값은 가정으로 남깁니다.</div></body></html>`;
}
let pdfQueue = Promise.resolve();
async function renderPdf(id, port) {
  const candidates = [
    process.env.ORBITAL_PDF_BROWSER,
    process.env["PROGRAMFILES(X86)"] &&
      path.join(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft/Edge/Application/msedge.exe",
      ),
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        "Google/Chrome/Application/chrome.exe",
      ),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  let executable;
  for (const filename of candidates) {
    try {
      await fs.access(filename);
      executable = filename;
      break;
    } catch {
      /* 다음 브라우저 확인 */
    }
  }
  if (!executable)
    throw new Error(
      "PDF 생성용 Edge/Chrome을 찾지 못했습니다. 보고서 인쇄 화면에서 'PDF로 저장'을 이용해 주세요.",
    );
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "orbital-report-"));
  try {
    const filename = path.join(folder, "report.pdf");
    let diagnostics = "";
    await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--no-pdf-header-footer",
          "--user-data-dir=" + path.join(folder, "profile"),
          "--print-to-pdf=" + filename,
          `http://127.0.0.1:${port}/api/reports/${encodeURIComponent(id)}/html`,
        ],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      child.stderr.on("data", (chunk) => {
        diagnostics = (diagnostics + chunk.toString()).slice(-2000);
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error("PDF 생성 시간 초과. 인쇄 화면에서 PDF로 저장해 주세요."),
        );
      }, 45000);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          console.error("[ORBITAL PDF]", diagnostics);
          reject(
            new Error("PDF 생성에 실패했습니다. 인쇄 화면을 이용해 주세요."),
          );
        }
      });
    });
    // Windows 브라우저 런처는 실제 렌더러보다 먼저 종료될 수 있습니다.
    const deadline = Date.now() + 30000;
    while (true) {
      try {
        const stat = await fs.stat(filename);
        if (stat.size > 5) break;
      } catch {
        /* 렌더러의 파일 출력을 기다립니다. */
      }
      if (Date.now() > deadline) {
        console.error("[ORBITAL PDF]", diagnostics);
        throw new Error(
          "PDF 출력 파일이 생성되지 않았습니다. 인쇄 화면에서 PDF로 저장해 주세요.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const pdf = await fs.readFile(filename);
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("PDF 출력 파일을 확인하지 못했습니다.");
    return pdf;
  } finally {
    await fs
      .rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      })
      .catch((error) =>
        console.warn("[ORBITAL PDF] temporary cleanup:", error.code),
      );
  }
}
function generatePdf(id, port) {
  const result = pdfQueue.then(() => renderPdf(id, port));
  pdfQueue = result.catch(() => {});
  return result;
}
module.exports = { reportData, printHtml, generatePdf };
