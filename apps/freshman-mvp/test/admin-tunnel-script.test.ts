import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('admin tunnel script is ASCII-safe and keeps the required SSH controls', async () => {
  const scriptPath = path.resolve(
    import.meta.dirname,
    '..',
    'scripts',
    'open-production-admin.ps1',
  );
  const script = await readFile(scriptPath, 'utf8');

  assert.match(script, /^[\x00-\x7f]*$/);
  assert.match(script, /Get-NetTCPConnection -LocalPort \$localPort -State Listen/);
  assert.match(script, /Start-Process -FilePath \$ssh -ArgumentList/);
  assert.match(script, /'-o', 'BatchMode=yes'/);
  assert.match(script, /'-o', 'ExitOnForwardFailure=yes'/);
  assert.match(script, /'-o', 'ServerAliveInterval=30'/);
  assert.match(script, /'-o', 'ServerAliveCountMax=3'/);
  assert.match(script, /'-L', "\$localPort`:127\.0\.0\.1:3212"/);
  assert.match(script, /'ubuntu@124\.222\.171\.40'/);
  assert.match(script, /-WindowStyle Hidden/);
  assert.match(script, /if \(-not \$NoBrowser\) \{\s*Start-Process \$adminUrl\s*\}/);
});
