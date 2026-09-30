// Each harness runs in its own process so mocked globals cannot leak between suites.
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
for (const name of ['auth-session', 'use-api', 'issues', 'board', 'organization', 'filter-dashboard']) {
  const result = spawnSync(process.execPath, [join(__dirname, `${name}-check.cjs`)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
