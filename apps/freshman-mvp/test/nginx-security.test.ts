import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('production Nginx example keeps admin pages and APIs behind the SSH tunnel', async () => {
  const configPath = path.resolve(
    import.meta.dirname,
    '..',
    'deploy',
    'nginx',
    'liveinhdu.cn.conf.example',
  );
  const config = await readFile(configPath, 'utf8');
  const publicProxyIndex = config.indexOf('location / {');
  const deniedLocations = [
    'location = /admin { return 403; }',
    'location ^~ /admin/ { return 403; }',
    'location = /api/admin { return 403; }',
    'location ^~ /api/admin/ { return 403; }',
    'location = /api/reviews { return 403; }',
    'location ^~ /api/reviews/ { return 403; }',
  ];

  assert.notEqual(publicProxyIndex, -1);
  for (const location of deniedLocations) {
    const index = config.indexOf(location);
    assert.notEqual(index, -1, `missing Nginx denial rule: ${location}`);
    assert.ok(index < publicProxyIndex, `${location} must precede the public proxy`);
  }
});
