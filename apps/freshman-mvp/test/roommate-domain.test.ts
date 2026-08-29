import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  listCampusTemplates,
  normalizeRoomAddress,
} from '../src/roommates/address-templates.js';
import { RoommateCrypto } from '../src/roommates/crypto.js';

test('normalizes XiaSha room identity within the 1-40 building range', () => {
  const room = normalizeRoomAddress({
    campus: 'xiasha', building: '011', orientation: 'south', room: '0207', bed: null,
  });
  assert.deepEqual(room, {
    campus: 'xiasha', templateVersion: 'xiasha-v1', building: '11',
    orientation: 'south', room: '207', bed: null,
    canonical: 'xiasha|xiasha-v1|11|south|207',
    display: '下沙校区 · 11号楼 · 南 · 207',
  });
});

test('normalizes both enabled campuses with all supported orientations', () => {
  assert.deepEqual(listCampusTemplates(), [
    { code: 'xiasha', name: '下沙校区', templateVersion: 'xiasha-v1', enabled: true },
    { code: 'shaoxing', name: '绍兴校区', templateVersion: 'shaoxing-v1', enabled: true },
  ]);
  for (const campus of ['xiasha', 'shaoxing'] as const) {
    for (const orientation of ['east', 'south', 'west', 'north', 'unknown'] as const) {
      const room = normalizeRoomAddress({ campus, building: '1', orientation, room: '101' });
      assert.equal(room.campus, campus);
      assert.equal(room.orientation, orientation);
      assert.equal(room.bed, null);
      assert.equal(room.display.includes('不确定'), orientation === 'unknown');
    }
  }
});

test('rejects invalid roommate address submissions', () => {
  const invalidInputs = [
    { building: '0', orientation: 'south', room: '101', message: '楼栋必须为正数' },
    { building: '41', orientation: 'south', room: '101', message: '楼栋必须在1-40号之间' },
    { building: '-1', orientation: 'south', room: '101', message: '楼栋格式无效' },
    { building: '1', orientation: 'south', room: ' ', message: '房间号格式无效' },
    { building: '1', orientation: 'south', room: '10\u0000', message: '房间号格式无效' },
    { building: '1', orientation: 'toString', room: '101', message: '朝向不支持' },
    { building: '1', orientation: 'constructor', room: '101', message: '朝向不支持' },
    { building: '1', orientation: '', room: '101', message: '朝向不支持' },
    { building: '1', orientation: 'south-east', room: '101', message: '朝向不支持' },
    { building: '1', orientation: 'south', room: '101', campus: 'other', message: '校区不支持' },
    { building: '1', orientation: 'south', room: '101', bed: '6', message: '床位必须为1-5号' },
  ] as const;

  for (const { message, ...input } of invalidInputs) {
    assert.throws(
      () => normalizeRoomAddress({ campus: 'xiasha', ...input } as never),
      (error: unknown) => error instanceof Error && error.message === message,
    );
  }
});

test('accepts the upper building boundary 40 and rejects 41', () => {
  const room = normalizeRoomAddress({
    campus: 'xiasha', building: '040', orientation: 'south', room: '101',
  });
  assert.equal(room.building, '40');
  assert.throws(
    () => normalizeRoomAddress({
      campus: 'xiasha', building: '41', orientation: 'south', room: '101',
    }),
    (error: unknown) => error instanceof Error && error.message === '楼栋必须在1-40号之间',
  );
});

test('normalizes optional beds without changing the legacy XiaSha canonical key', () => {
  for (const bed of ['1', '2', '3', '4', '5'] as const) {
    const room = normalizeRoomAddress({
      campus: 'xiasha', building: '11', orientation: 'south', room: '207', bed,
    });
    assert.equal(room.bed, bed);
    assert.equal(room.canonical, 'xiasha|xiasha-v1|11|south|207');
    assert.equal(room.display, `下沙校区 · 11号楼 · 南 · 207 · ${bed}号床`);
  }
  const withoutBed = normalizeRoomAddress({
    campus: 'xiasha', building: '11', orientation: 'south', room: '207',
  });
  assert.equal(withoutBed.bed, null);
  assert.equal(withoutBed.display, '下沙校区 · 11号楼 · 南 · 207');
  assert.equal(withoutBed.canonical, 'xiasha|xiasha-v1|11|south|207');
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

test('uses independent IVs and supports empty encrypted fields', () => {
  const crypto = new RoommateCrypto({
    encryptionKey: Buffer.alloc(32, 7), hmacKey: Buffer.alloc(32, 9),
  });
  assert.notEqual(crypto.encrypt('same'), crypto.encrypt('same'));
  assert.equal(crypto.decrypt(crypto.encrypt('')), '');
});

test('rejects tampered ciphertext with a generic error', () => {
  const crypto = new RoommateCrypto({
    encryptionKey: Buffer.alloc(32, 7), hmacKey: Buffer.alloc(32, 9),
  });
  const ciphertext = crypto.encrypt('secret value');
  const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => crypto.decrypt(tampered),
    (error: unknown) => error instanceof Error && error.message === 'Invalid ciphertext',
  );
});

test('uses domain-separated HMAC indexes and 32-byte random credentials', () => {
  const hmacKey = Buffer.alloc(32, 9);
  const crypto = new RoommateCrypto({ encryptionKey: Buffer.alloc(32, 7), hmacKey });
  const digest = (value: string) => createHmac('sha256', hmacKey).update(value).digest('base64url');

  assert.equal(crypto.roomKey('room-id'), digest('room\0room-id'));
  assert.equal(crypto.buildingKey('xiasha', '11'), digest('building\0xiasha|11'));
  assert.equal(crypto.contactDigest('wechat', 'user-id'), digest('contact\0wechat|user-id'));
  assert.equal(crypto.managementDigest('code'), digest('management\0code'));
  assert.equal(crypto.sessionDigest('token'), digest('session\0token'));
  assert.equal(Buffer.from(crypto.newManagementCode(), 'base64url').length, 32);
  assert.equal(Buffer.from(crypto.newSessionToken(), 'base64url').length, 32);
});

test('rejects encryption and HMAC keys shorter than 32 bytes', () => {
  assert.throws(
    () => new RoommateCrypto({ encryptionKey: Buffer.alloc(31), hmacKey: Buffer.alloc(32) }),
    /encryptionKey must be exactly 32 bytes/,
  );
  assert.throws(
    () => new RoommateCrypto({ encryptionKey: Buffer.alloc(32), hmacKey: Buffer.alloc(31) }),
    /hmacKey must be at least 32 bytes/,
  );
});
