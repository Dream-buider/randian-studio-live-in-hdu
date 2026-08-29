import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteRoommateBuildingGroupRepository } from '../src/repositories/sqlite-roommate-building-group-repository.js';
import {
  decodeBuildingGroupImage,
  normalizeBuildingGroup,
  normalizeBuildingGroupCampus,
} from '../src/roommates/building-groups.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

test('migration v6 adds building groups without changing roommate data', () => {
  const database = openDatabase(':memory:');
  try {
    migrateDatabase(database);
    database.prepare(`
      INSERT INTO roommate_registrations (
        id, campus_code, template_version, room_key, bed_key, building_key,
        address_ciphertext, nickname_ciphertext, management_digest, status,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy', 'xiasha', 'xiasha-v1', 'room', null, '11', 'cipher', 'nick',
      'digest', 'active', '2026-01-01', '2026-01-01', '2027-01-01',
    );
    migrateDatabase(database);
    assert.equal(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'roommate_building_groups'").get()?.name,
      'roommate_building_groups',
    );
    assert.equal(database.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get()?.version, 6);
    assert.deepEqual(
      database.prepare('SELECT id, bed_key FROM roommate_registrations').all()
        .map((row) => ({ id: String((row as Record<string, unknown>).id), bed_key: (row as Record<string, unknown>).bed_key })),
      [{ id: 'legacy', bed_key: null }],
    );
  } finally {
    database.close();
  }
});

test('building group image repository supports png/jpeg replacement and deletion', async () => {
  const database = openDatabase(':memory:');
  migrateDatabase(database);
  try {
    const repository = new SqliteRoommateBuildingGroupRepository(database);
    const png = decodeBuildingGroupImage('image/png', PNG.toString('base64'));
    await repository.upsert({
      campusCode: 'xiasha', building: '1', ...png,
      updatedAt: '2026-08-29T00:00:00.000Z', updatedBy: 'local-admin',
    });
    assert.equal((await repository.get('xiasha', '1'))?.imageMime, 'image/png');
    const jpeg = decodeBuildingGroupImage('image/jpeg', JPEG.toString('base64'));
    await repository.upsert({
      campusCode: 'xiasha', building: '1', ...jpeg,
      updatedAt: '2026-08-29T00:01:00.000Z', updatedBy: 'local-admin',
    });
    assert.equal((await repository.get('xiasha', '1'))?.imageMime, 'image/jpeg');
    assert.equal(await repository.delete('xiasha', '1'), true);
    assert.equal(await repository.get('xiasha', '1'), null);
  } finally {
    database.close();
  }
});

test('building group validation rejects invalid campus, building, base64, svg and mismatched headers', () => {
  assert.equal(normalizeBuildingGroupCampus('xiasha'), 'xiasha');
  assert.equal(normalizeBuildingGroupCampus('shaoxing'), 'shaoxing');
  assert.equal(normalizeBuildingGroup('01'), '1');
  assert.equal(normalizeBuildingGroup('40'), '40');
  assert.throws(() => normalizeBuildingGroup('41'), /building is invalid/);
  assert.throws(() => normalizeBuildingGroupCampus('hangzhou'), /campus is invalid/);
  assert.throws(() => decodeBuildingGroupImage('image/png', 'not-base64'), /Invalid base64 image/);
  assert.throws(() => decodeBuildingGroupImage('image/png', ''), /Invalid base64 image/);
  assert.throws(() => decodeBuildingGroupImage('image/png', Buffer.from('<svg/>').toString('base64')), /Image content does not match/);
  assert.throws(() => decodeBuildingGroupImage('image/png', JPEG.toString('base64')), /Image content does not match/);
  assert.throws(() => decodeBuildingGroupImage('image/jpeg', PNG.toString('base64')), /Image content does not match/);
  assert.throws(() => decodeBuildingGroupImage('image/svg+xml', PNG.toString('base64')), /Only PNG and JPEG/);
  const oversized = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]).toString('base64');
  assert.throws(() => decodeBuildingGroupImage('image/png', oversized), /exceeds 1 MiB/);
});
