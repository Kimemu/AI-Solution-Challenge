/** API 입력 검증과 문자열·숫자·URL 정규화입니다. */
function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("객체 형식의 요청이 필요합니다.");
  return value;
}
function text(value, max = 2000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
function safeUrl(value) {
  try {
    const url = new URL(text(value, 2000));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function required(value, name, max = 2000) {
  const result = text(value, max);
  if (!result) throw new Error(name + "을 입력해 주세요.");
  return result;
}
function number(value, nullable = false) {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  if (value === null || value === undefined || value === "")
    throw new Error("숫자 값을 입력해 주세요.");
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1e12)
    throw new Error("유효한 숫자를 입력해 주세요.");
  return result;
}
function scores(value) {
  const input = value && typeof value === "object" ? value : {};
  const score = (key) =>
    Math.max(1, Math.min(5, Math.round(Number(input[key]) || 3)));
  return {
    fit: score("fit"),
    demand: score("demand"),
    economics: score("economics"),
    moat: score("moat"),
  };
}

module.exports = {
  asObject,
  text,
  safeUrl,
  required,
  number,
  number,
  number,
  scores,
};
