import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(new URL('../dist/server/wrangler.json', import.meta.url))) {
  console.error('먼저 npm run build를 실행해 로컬 DB 설정을 생성해 주세요.');
  process.exit(1);
}
const args = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js',
  'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state'];
const query = spawnSync(process.execPath, [...args, '--command', "SELECT name FROM sqlite_master WHERE type='table'", '--json'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (query.status !== 0) { console.error(query.stderr || query.stdout); process.exit(query.status ?? 1); }
const tables = new Set(JSON.parse(query.stdout)[0].results.map(row => row.name));
const expected = ['signals', 'records', 'audit', 'refresh_runs'];
if (expected.every(name => tables.has(name))) {
  console.log('로컬 DB가 준비되어 있습니다. 기존 데이터를 유지합니다.');
} else if (expected.some(name => tables.has(name))) {
  console.error('일부 테이블만 존재합니다. 데이터를 보존하기 위해 자동 초기화를 중단했습니다. 로컬 DB 스키마를 확인해 주세요.');
  process.exit(1);
} else {
  const result = spawnSync(process.execPath, [...args, '--file', 'drizzle/0000_perpetual_polaris.sql'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('로컬 DB 초기화 완료. 첫 화면에서 기본 자료를 생성합니다.');
}
