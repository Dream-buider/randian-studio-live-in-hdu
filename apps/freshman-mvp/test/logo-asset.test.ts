import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_LOGO_SHA256 = '29e90207777480ba39bc0102a4ad51b39645918a6de04148fb58a79428ec89db';

test('shared Randian Studio logo matches the approved replacement asset', async () => {
  const logoPath = path.resolve(
    import.meta.dirname,
    '..',
    'web',
    'public',
    'brand',
    'randian-studio-logo.png',
  );
  const contents = await readFile(logoPath);
  const digest = createHash('sha256').update(contents).digest('hex');

  assert.equal(digest, EXPECTED_LOGO_SHA256);
});
