/** API 경로를 업무 함수에 연결합니다. */
const { ingest, refresh } = require("./collection");
const {
  actual,
  createRecord,
  decision,
  schedule,
  updateRecord,
  verify,
} = require("./records");
const { MAX_ITEMS_PER_SOURCE } = require("./signals");
const { getState } = require("./state");
const { asObject } = require("./validation");
const { sourceFeeds } = require("../js/config");
const mutations = {
  ingest,
  records: createRecord,
  decisions: decision,
  actuals: actual,
  verify,
  schedule,
};
async function handleApi(request, path) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        return Response.json(
          { error: "동일 사이트에서 실행해 주세요." },
          { status: 403 },
        );
    }
    const actor = "워크스페이스 사용자";
    if (request.method === "GET" && path === "update-manifest")
      return Response.json({
        revision: "orbital-updater-v1",
        sources: sourceFeeds,
        writer: "/api/ingest",
        maxItemsPerSource: MAX_ITEMS_PER_SOURCE,
      });
    if (request.method === "GET" && path === "state")
      return Response.json(await getState(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method === "POST" && path === "refresh")
      return Response.json(await refresh(actor));
    const raw = await request.text();
    if (raw.length > (path === "ingest" ? 200000 : 20000))
      return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const body = asObject(JSON.parse(raw || "{}"));
    if (request.method === "PATCH" && path.startsWith("records/"))
      return Response.json(await updateRecord(path.slice(8), body, actor));
    if (request.method === "POST" && Object.hasOwn(mutations, path))
      return Response.json(await mutations[path](body, actor));
    return Response.json(
      { error: "경로를 찾을 수 없습니다." },
      { status: 404 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "처리에 실패했습니다.";
    return Response.json(
      { error: message.replace(/^CONFLICT:/, "") },
      { status: message.startsWith("CONFLICT:") ? 409 : 400 },
    );
  }
}

module.exports = { handleApi };
