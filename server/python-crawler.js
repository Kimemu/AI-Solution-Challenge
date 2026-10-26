/** Python 본문 수집기를 실행하는 JSONL 어댑터. HTTP 요청을 오래 붙잡지 않습니다. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function pythonExecutable() {
  const local = path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const executable = process.env.ORBITAL_PYTHON || local;
  if (!fs.existsSync(executable))
    throw new Error(
      "Python 기사 수집기 설치가 필요합니다. 서버 PC에서 setup-crawler.cmd를 실행해 주세요.",
    );
  return executable;
}
function crawlMany(articles, onResult = () => {}) {
  if (!articles.length) return Promise.resolve([]);
  const executable = pythonExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ["-u", path.join(root, "crawler/worker.py")],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
    );
    const results = [];
    child.stdout.setEncoding("utf8");
    let buffer = "",
      fatal,
      diagnostics = "",
      callbackError;
    const seen = new Set();
    const processLine = (line) => {
      if (!line.trim()) return;
      try {
        const item = JSON.parse(line);
        if (item.fatal) {
          fatal = new Error(item.error);
          return;
        }
        if (
          seen.has(item.id) ||
          !articles.some((article) => article.id === item.id)
        )
          return;
        seen.add(item.id);
        results.push(item);
        onResult(item);
      } catch (error) {
        callbackError ||= error;
      }
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let split;
      while ((split = buffer.indexOf("\n")) !== -1) {
        processLine(buffer.slice(0, split));
        buffer = buffer.slice(split + 1);
      }
      if (buffer.length > 3_000_000) {
        fatal = new Error("Python 수집기 응답이 너무 큽니다.");
        child.kill();
      }
    });
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-2000);
    });
    child.stdin.on("error", () => {});
    const timer = setTimeout(
      () => {
        fatal = new Error(
          "Python 본문 수집 시간이 초과됐습니다. 완료된 본문은 저장했습니다.",
        );
        child.kill();
      },
      Math.min(900000, Math.max(90000, articles.length * 15000)),
    );
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Python 수집기를 실행하지 못했습니다. setup-crawler.cmd를 실행해 주세요.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) processLine(buffer);
      if (fatal || callbackError) return reject(fatal || callbackError);
      if (code !== 0) {
        console.error("[ORBITAL crawler]", diagnostics);
        return reject(
          new Error(
            "Python 기사 수집기 실행에 실패했습니다. 설치와 서버 로그를 확인해 주세요.",
          ),
        );
      }
      for (const article of articles)
        if (!seen.has(article.id)) {
          const item = {
            id: article.id,
            ok: false,
            code: "missing-result",
            error: "수집기에서 기사 본문을 반환하지 않았습니다.",
          };
          results.push(item);
          onResult(item);
        }
      resolve(results);
    });
    child.stdin.end(
      JSON.stringify({
        articles: articles.map(({ id, url, title }) => ({ id, url, title })),
      }),
      "utf8",
    );
  });
}
async function crawlArticlePython(url) {
  const [result] = await crawlMany([{ id: "single", url }]);
  if (!result.ok) throw new Error(result.error);
  const { id, ok, ...article } = result;
  return { ...article, analysisBasis: "article-body" };
}
module.exports = { crawlMany, crawlArticlePython, pythonExecutable };
