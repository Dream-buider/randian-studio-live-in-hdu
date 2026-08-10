import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listCampusTemplates,
  normalizeRoomAddress,
} from '../src/roommates/address-templates.js';
import { RoommateCrypto } from '../src/roommates/crypto.js';

test('normalizes XiaSha room identity without hard-coding a building list', () => {
  const room = normalizeRoomAddress({
    campus: 'xiasha', building: '011', orientation: 'south', room: '0207',
  });
  assert.deepEqual(room, {
    campus: 'xiasha', templateVersion: 'xiasha-v1', building: '11',
    orientation: 'south', room: '207',
    canonical: 'xiasha|xiasha-v1|11|south|207',
    display: '下沙校区 · 11号楼 · 南 · 207',
  });
});

test('keeps Shaoxing visible but rejects registration', () => {
  assert.equal(listCampusTemplates().find((item) => item.code === 'shaoxing')?.enabled, false);
  assert.throws(
    () => normalizeRoomAddress({ campus: 'shaoxing', building: '1', orientation: 'south', room: '101' }),
    /暂未开放/,
  );
});

test('encrypts authenticated fields and derives stable non-plaintext indexes', () => {
  const crypto = new RoommateCrypto({
    encryptionKey: Buffer.alloc(32, 7), hmacKey: Buffer.alloc(32, 9),
  });
  const ciphertext = crypto.encrypt('下沙校区 · 11号楼 · 南 · 207');
  assert.doesNotMatch(ciphertext, /11号楼|207/);
  assert.equal(crypto.decrypt(ciphertext), '下沙校区 · 11号楼 · 南 · 207');
  assert.equal(crypto.roomKey('same'), crypto.roomKey('same'));
  assert.notEqual(crypto.roomKey('same'), crypto.roomKey('other'));
});
