import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const checkScript = path.join(repoRoot, 'scripts', 'test-knowledge-stack.ps1');

test('Phase B live E2E is explicitly skipped without Docker and secrets, while static contract remains inspectable', (context) => {
  if (!process.env.PHASE_B_LIVE_E2E) {
    context.skip('PHASE_B_LIVE_E2E is not set; Docker, models, and credentials are intentionally not started by tests.');
    return;
  }
  const result = spawnSync('pwsh', ['-NoProfile', '-File', checkScript, '-ValidateOnly'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
