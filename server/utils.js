/** 시간·식별자·JSON 직렬화의 공통 함수입니다. */
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const json = (value) => JSON.stringify(value);

module.exports = { now, uid, json };
