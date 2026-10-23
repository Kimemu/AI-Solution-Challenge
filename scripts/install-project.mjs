import { spawnSync } from 'node:child_process';
import { readExecutionProfile } from './execution-profile.mjs';

// Keep the original managed installer, but do not require Bash/flock on Windows.
const managed = readExecutionProfile() === 'managed-linux';
const command = managed ? 'bash' : process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
const args = managed ? ['scripts/install-pnpm.sh'] : process.platform === 'win32'
  ? ['/d', '/s', '/c', 'pnpm install --frozen-lockfile --prefer-offline']
  : ['install', '--frozen-lockfile', '--prefer-offline'];
const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
