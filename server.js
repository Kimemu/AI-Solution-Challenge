/** 외부 패키지 없이 실행하는 로컬 HTTP 서버입니다. node server.js */
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { networkInterfaces } = require("node:os");
const { handleApi } = require("./server/api");
const port = Number(process.env.PORT || 8001);
const hostname = process.env.HOST || "127.0.0.1";
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};
const server = http.createServer(async (incoming, outgoing) => {
  let url;
  try {
    // 팀원의 브라우저가 접속한 주소를 사용해야 동일 출처 API 쓰기가 허용됩니다.
    const origin = new URL(`http://${incoming.headers.host}`);
    if (!incoming.url.startsWith("/") || incoming.url.startsWith("//"))
      throw new Error("Invalid request target");
    url = new URL(incoming.url, origin);
  } catch {
    outgoing.writeHead(400);
    outgoing.end("Bad request");
    return;
  }
  const fileOrigin = incoming.headers.origin === "null";
  if (fileOrigin) {
    outgoing.setHeader("Access-Control-Allow-Origin", "null");
    outgoing.setHeader("Vary", "Origin");
  }
  if (incoming.method === "OPTIONS") {
    if (!fileOrigin && incoming.headers.origin !== url.origin) {
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    outgoing.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH");
    outgoing.setHeader("Access-Control-Allow-Headers", "Content-Type");
    outgoing.writeHead(204);
    outgoing.end();
    return;
  }
  try {
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      let length = 0;
      for await (const chunk of incoming) {
        length += chunk.length;
        if (length > 200000) {
          outgoing.writeHead(413, { "Content-Type": "application/json" });
          outgoing.end(JSON.stringify({ error: "요청이 너무 큽니다." }));
          return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value && !(fileOrigin && name === "origin"))
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: incoming.method,
        headers,
        body: ["GET", "HEAD"].includes(incoming.method) ? undefined : body,
      });
      const response = await handleApi(request, url.pathname.slice(5));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    if (!/^\/(index\.html|css\/|js\/|assets\/)/.test(pathname)) {
      outgoing.writeHead(404);
      outgoing.end("Not found");
      return;
    }
    const filename = path.resolve(root, "." + pathname);
    if (!filename.startsWith(root + path.sep)) {
      outgoing.writeHead(403);
      outgoing.end("Forbidden");
      return;
    }
    const data = await fs.readFile(filename);
    outgoing.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    outgoing.end(data);
  } catch (error) {
    outgoing.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "application/json; charset=utf-8",
    });
    outgoing.end(
      JSON.stringify({
        error:
          error.code === "ENOENT"
            ? "파일을 찾을 수 없습니다."
            : "서버 요청을 처리하지 못했습니다.",
      }),
    );
  }
});
server.on("error", async (error) => {
  const url = `http://${["0.0.0.0", "::"].includes(hostname) ? "127.0.0.1" : hostname}:${port}/`;
  if (error.code === "EADDRINUSE") {
    try {
      const response = await fetch(url + "api/update-manifest", {
        signal: AbortSignal.timeout(2500),
        redirect: "error",
      });
      const manifest = await response.json();
      if (response.ok && manifest.revision === "orbital-updater-v1") {
        console.log(
          "ORBITAL is already running. Opening existing server: " + url,
        );
        console.log("Keep the original server window open.");
        if (hostname === "0.0.0.0")
          console.log(
            "For team access, the original server must be started with start-team.cmd.",
          );
        if (process.argv.includes("--open")) openBrowser(url);
        return;
      }
    } catch {
      // 다른 서비스이거나 응답하지 않는 포트는 재사용하지 않습니다.
    }
  }
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is used by another service or an unresponsive server. ORBITAL could not reuse it.`
      : error.message,
  );
  process.exitCode = 1;
});
function openBrowser(url) {
  const { spawn } = require("node:child_process");
  const command =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
  child.on("error", () => console.log("Open " + url + " in your browser."));
}
if (require.main === module) {
  server.listen(port, hostname, () => {
    const localHost = ["0.0.0.0", "::"].includes(hostname)
      ? "127.0.0.1"
      : hostname;
    const url = `http://${localHost}:${port}/`;
    console.log(
      "ORBITAL: " + url + "\nStop: Ctrl+C. Database: data/orbital.sqlite",
    );
    if (hostname === "0.0.0.0") {
      console.log("Team access (same Wi-Fi / LAN):");
      const addresses = new Set(
        Object.values(networkInterfaces())
          .flat()
          .filter((entry) => entry.family === "IPv4" && !entry.internal)
          .map((entry) => entry.address),
      );
      for (const address of addresses)
        console.log(`  http://${address}:${port}/`);
      console.log("Keep this window open. All visitors share this database.");
    }
    if (process.argv.includes("--open")) openBrowser(url);
  });
}
module.exports = { server };
