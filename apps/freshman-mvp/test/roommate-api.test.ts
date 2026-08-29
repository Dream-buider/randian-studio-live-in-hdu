import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import { SqliteRoommateBuildingGroupRepository } from '../src/repositories/sqlite-roommate-building-group-repository.js';
import { createApp } from '../src/server/app.js';
import type { AppConfig } from '../src/server/config.js';
import type { RoommateService } from '../src/roommates/service.js';

const COOKIE_NAME = 'live_in_hdu_roommate';
const COOKIE_SECRET = Buffer.alloc(32, 3).toString('base64');
const VALID_INPUT = {
  address: { campus: 'xiasha', building: '11', orientation: 'south', room: '207' },
  nickname: '小燃',
  contactType: 'wechat',
  contactValue: 'live-in-hdu',
  consent: true,
};

function config(enabled: boolean): AppConfig {
  return {
    host: '127.0.0.1',
    port: 3210,
    databasePath: 'runtime/test.db',
    databaseProvider: 'sqlite',
    postgresUrl: '',
    publicDir: 'dist/client',
    modelApiKey: '',
    modelEnabled: false,
    requestTimeoutMs: 20_000,
    knowledgeProvider: 'local',
    freshmanGuidePath: null,
    weknoraBaseUrl: 'http://127.0.0.1:8080/api/v1',
    weknoraApiKey: '',
    weknoraDocumentKbId: '',
    weknoraFaqKbId: '',
    weknoraScoreThreshold: 0.55,
    searchProvider: 'unavailable',
    searxngBaseUrl: 'http://127.0.0.1:8888',
    searchTimeoutMs: 10_000,
    searchMaxResults: 6,
    disclaimer: '请注意甄别',
    roommate: {
      requested: enabled,
      publicOrigin: enabled ? 'https://liveinhdu.cn' : '',
      encryptionKey: enabled ? Buffer.alloc(32, 1) : null,
      hmacKey: enabled ? Buffer.alloc(32, 2) : null,
      cookieSecret: enabled ? COOKIE_SECRET : null,
      secure: enabled,
    },
  };
}

interface ServiceCalls {
  createContexts: Array<{ ip: string; sessionToken?: string }>;
  ownTokens: string[];
  updateTokens: string[];
  deleteTokens: string[];
  memberTokens: string[];
  recoverInputs: Array<{ registrationId: string; managementCode: string }>;
  adminActors: string[];
  moderationActors: string[];
}

function fakeService(calls: ServiceCalls): RoommateService {
  const own = {
    id: 'registration-1',
    address: {
      campus: 'xiasha' as const,
      templateVersion: 'xiasha-v1' as const,
      building: '11',
      orientation: 'south' as const,
      room: '207',
      bed: null,
      canonical: 'xiasha|xiasha-v1|11|south|207',
      display: '下沙校区 · 11号楼 · 南 · 207',
    },
    nickname: '小燃',
    contact: { type: 'wechat' as const, value: 'live-in-hdu' },
    status: 'active' as const,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-11-09T00:00:00.000Z',
    deletedAt: null,
  };
  return {
    async create(_input, context) {
      calls.createContexts.push(context);
      return {
        registrationId: own.id,
        managementCode: 'manage-once',
        sessionToken: 'session-created',
        own,
        members: [{ id: own.id, nickname: own.nickname, bed: own.address.bed, contact: own.contact }],
      };
    },
    async getMine(token) { calls.ownTokens.push(token); return own; },
    async updateMine(token) { calls.updateTokens.push(token); return own; },
    async deleteMine(token) { calls.deleteTokens.push(token); },
    async recover(registrationId, managementCode) {
      calls.recoverInputs.push({ registrationId, managementCode });
      return { registrationId: own.id, sessionToken: 'session-recovered', own };
    },
    async listMembers(token) {
      calls.memberTokens.push(token);
      return [{ id: own.id, nickname: own.nickname, bed: own.address.bed, contact: own.contact }];
    },
    async listAdmin(actor) {
      calls.adminActors.push(actor);
      return [{
        ...own,
        contact: { type: 'wechat' as const, masked: true as const },
        lastModeration: null,
      }];
    },
    async revealAdminContact(_id, actor) {
      calls.adminActors.push(actor);
      return {
        contact: { type: 'wechat' as const, value: 'live-in-hdu' },
        lastModeration: {
          actorId: 'local-admin', action: 'view_contact' as const,
          reason: '核查用户投诉', createdAt: '2026-08-11T00:01:00.000Z',
        },
      };
    },
    async moderate(_id, input) {
      calls.moderationActors.push(input.actorId);
      return {
        ...own,
        contact: { type: 'wechat' as const, masked: true as const },
        lastModeration: {
          actorId: 'local-admin', action: input.action, reason: input.reason,
          createdAt: '2026-08-11T00:02:00.000Z',
        },
      };
    },
    async runRetention() {},
  } as RoommateService;
}

async function withApp(
  enabled: boolean,
  run: (app: ReturnType<typeof createApp>, calls: ServiceCalls) => Promise<void>,
  mutateService?: (service: RoommateService) => void,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-api-'));
  const database = openDatabase(path.join(directory, 'api.db'));
  migrateDatabase(database);
  const calls: ServiceCalls = {
    createContexts: [],
    ownTokens: [],
    updateTokens: [],
    deleteTokens: [],
    memberTokens: [],
    recoverInputs: [],
    adminActors: [],
    moderationActors: [],
  };
  const service = fakeService(calls);
  const buildingGroups = new SqliteRoommateBuildingGroupRepository(database);
  mutateService?.(service);
  const app = createApp({
    config: config(enabled),
    content: new SqliteContentRepository(database),
    reviews: new SqliteReviewRepository(database),
    router: { async answer() { return {}; } },
    roommates: enabled ? service : undefined,
    roommateBuildingGroups: buildingGroups,
  });
  try {
    await run(app, calls);
  } finally {
    await app.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('returns templates but refuses sensitive roommate operations while disabled', async () => {
  await withApp(false, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/roommates/config' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, false);
    assert.equal(response.json().campuses.find((item: { code: string }) => item.code === 'xiasha').enabled, true);
    assert.equal(response.json().campuses.find((item: { code: string }) => item.code === 'shaoxing').enabled, true);

    const create = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    assert.equal(create.statusCode, 503);
  });
});

test('trusts HTTPS forwarding only from loopback and never returns the session token in JSON', async () => {
  await withApp(true, async (app, calls) => {
    const untrusted = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      remoteAddress: '203.0.113.8',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    assert.equal(untrusted.statusCode, 403);

    const created = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    assert.equal(created.statusCode, 200);
    assert.equal(JSON.stringify(created.json()).includes('session-created'), false);
    const setCookie = created.headers['set-cookie'];
    assert.equal(typeof setCookie, 'string');
    assert.match(String(setCookie), new RegExp(`^${COOKIE_NAME}=`));
    assert.match(String(setCookie), /Secure/i);
    assert.match(String(setCookie), /HttpOnly/i);
    assert.match(String(setCookie), /SameSite=Strict/i);
    assert.match(String(setCookie), /Path=\/api\/roommates/i);
    assert.match(String(setCookie), /Max-Age=7776000/i);
    assert.deepEqual(calls.createContexts, [{ ip: '127.0.0.1' }]);
  });
});

test('uses only a valid signed cookie for own/member access, rotates recovery, and clears delete', async () => {
  await withApp(true, async (app, calls) => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    const cookie = String(created.headers['set-cookie']).split(';', 1)[0];

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/roommates/members',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https', cookie: `${COOKIE_NAME}=forged` },
    });
    assert.equal(invalid.statusCode, 404);

    const members = await app.inject({
      method: 'GET',
      url: '/api/roommates/members',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https', cookie },
    });
    assert.equal(members.statusCode, 200);
    assert.equal(members.json().items.length, 1);
    assert.equal(members.json().items[0].bed, null);
    assert.equal('roomKey' in members.json().items[0], false);
    assert.deepEqual(calls.memberTokens, ['session-created']);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/roommates/me',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https', cookie },
    });
    assert.equal(mine.statusCode, 200);
    assert.deepEqual(calls.ownTokens, ['session-created']);

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/roommates/me',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https', cookie },
      payload: { ...VALID_INPUT, nickname: '新昵称' },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(calls.updateTokens, ['session-created']);

    const recovered = await app.inject({
      method: 'POST',
      url: '/api/roommates/recover',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
      payload: { registrationId: 'registration-1', managementCode: 'manage-once' },
    });
    assert.equal(recovered.statusCode, 200);
    assert.equal(JSON.stringify(recovered.json()).includes('session-recovered'), false);
    assert.equal(typeof recovered.headers['set-cookie'], 'string');
    const recoveredCookie = String(recovered.headers['set-cookie']).split(';', 1)[0];
    assert.match(recoveredCookie, new RegExp(`^${COOKIE_NAME}=`));
    assert.notEqual(recoveredCookie, cookie);
    assert.deepEqual(calls.recoverInputs, [{
      registrationId: 'registration-1',
      managementCode: 'manage-once',
    }]);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/roommates/me',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https', cookie },
    });
    assert.equal(deleted.statusCode, 200);
    assert.match(String(deleted.headers['set-cookie']), new RegExp(`^${COOKIE_NAME}=;`));
    assert.deepEqual(calls.deleteTokens, ['session-created']);
  });
});

test('keeps roommate administration local-only and supplies the server actor', async () => {
  await withApp(true, async (app, calls) => {
    const remote = await app.inject({
      method: 'GET',
      url: '/api/admin/roommates?status=active',
      remoteAddress: '203.0.113.8',
    });
    assert.equal(remote.statusCode, 403);

    const proxiedRemote = await app.inject({
      method: 'GET',
      url: '/api/admin/roommates?status=active',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.8' },
    });
    assert.equal(proxiedRemote.statusCode, 403);

    const local = await app.inject({
      method: 'GET',
      url: '/api/admin/roommates?status=active&building=011&orientation=south&room=0207',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(local.statusCode, 200);
    assert.equal(local.json().items.length, 1);
    assert.equal(local.json().items[0].lastModeration, null);

    const revealed = await app.inject({
      method: 'POST',
      url: '/api/admin/roommates/registration-1/reveal-contact',
      remoteAddress: '127.0.0.1',
      payload: { reason: '核查用户投诉', actorId: 'attacker' },
    });
    assert.equal(revealed.statusCode, 400);

    const validReveal = await app.inject({
      method: 'POST',
      url: '/api/admin/roommates/registration-1/reveal-contact',
      remoteAddress: '127.0.0.1',
      payload: { reason: '核查用户投诉' },
    });
    assert.equal(validReveal.statusCode, 200);
    assert.deepEqual(validReveal.json().contact, { type: 'wechat', value: 'live-in-hdu' });
    assert.deepEqual(validReveal.json().lastModeration, {
      actorId: 'local-admin', action: 'view_contact', reason: '核查用户投诉',
      createdAt: '2026-08-11T00:01:00.000Z',
    });

    const moderated = await app.inject({
      method: 'POST',
      url: '/api/admin/roommates/registration-1/moderate',
      remoteAddress: '127.0.0.1',
      payload: { action: 'hide', reason: '隐藏异常信息' },
    });
    assert.equal(moderated.statusCode, 200);
    assert.deepEqual(moderated.json().item.lastModeration, {
      actorId: 'local-admin', action: 'hide', reason: '隐藏异常信息',
      createdAt: '2026-08-11T00:02:00.000Z',
    });
    assert.deepEqual(calls.moderationActors, ['local-admin']);
    assert.deepEqual(calls.adminActors, ['local-admin', 'local-admin']);
  });
});

test('normalizes exact numeric building and room filters before matching', async () => {
  await withApp(true, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/roommates?status=active&building=011&orientation=south&room=0207',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().items.length, 1);
  });
});

test('accepts both campuses, all orientations, and optional beds while rejecting invalid values', async () => {
  await withApp(true, async (app) => {
    for (const campus of ['xiasha', 'shaoxing'] as const) {
      for (const orientation of ['east', 'south', 'west', 'north', 'unknown'] as const) {
        for (const bed of ['1', '2', '3', '4', '5', null] as const) {
          const response = await app.inject({
            method: 'POST',
            url: '/api/roommates/registrations',
            remoteAddress: '127.0.0.1',
            headers: { 'x-forwarded-proto': 'https' },
            payload: { ...VALID_INPUT, address: { ...VALID_INPUT.address, campus, orientation, bed } },
          });
          assert.equal(response.statusCode, 200);
        }
      }
    }
    for (const address of [
      { ...VALID_INPUT.address, orientation: 'diagonal' },
      { ...VALID_INPUT.address, building: '41' },
      { ...VALID_INPUT.address, bed: '6' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/roommates/registrations',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-proto': 'https' },
        payload: { ...VALID_INPUT, address },
      });
      assert.equal(response.statusCode, 400);
    }
  });
});

test('maps active bed conflicts to 409 without exposing storage details', async () => {
  await withApp(true, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: { code: 'CONFLICT', message: 'Bed already occupied' },
    });
    assert.doesNotMatch(response.body, /SQLITE|roommate_registrations|\/srv\//i);
  }, (service) => {
    Object.defineProperty(service, 'create', {
      value: async () => { throw new Error('Bed already occupied'); },
    });
  });
});

test('rejects unknown or oversized public fields before calling the service', async () => {
  await withApp(true, async (app, calls) => {
    for (const payload of [
      { ...VALID_INPUT, status: 'active' },
      { ...VALID_INPUT, nickname: '新'.repeat(31) },
      { ...VALID_INPUT, address: { ...VALID_INPUT.address, roomKey: 'attacker-controlled' } },
      { ...VALID_INPUT, contactType: ['wechat'] },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/roommates/registrations',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-proto': 'https' },
        payload,
      });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(calls.createContexts.length, 0);

    const arrayAction = await app.inject({
      method: 'POST',
      url: '/api/admin/roommates/registration-1/moderate',
      remoteAddress: '127.0.0.1',
      payload: { action: ['hide'], reason: '数组不应通过' },
    });
    assert.equal(arrayAction.statusCode, 400);
    assert.equal(calls.moderationActors.length, 0);
  });
});

test('keeps unexpected roommate storage and crypto diagnostics out of responses', async () => {
  await withApp(true, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/roommates/registrations',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
      payload: VALID_INPUT,
    });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    assert.doesNotMatch(response.body, /SQLITE_IOERR|\/srv\/live-in-hdu|ciphertext/i);
  }, (service) => {
    Object.defineProperty(service, 'create', {
      value: async () => {
        throw new Error('SQLITE_IOERR at /srv/live-in-hdu/runtime/live-in-hdu.db ciphertext');
      },
    });
  });
});

const QR_PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]).toString('base64');

function pngBase64OfSize(size: number): string {
  const image = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image);
  return image.toString('base64');
}

test('manages building group QR codes locally while keeping public responses safe', async () => {
  await withApp(false, async (app) => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/xiasha/015',
      remoteAddress: '127.0.0.1',
      payload: { mimeType: 'image/png', imageBase64: QR_PNG_BASE64 },
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().updatedBy, 'local-admin');

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/roommate-building-groups',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().items.length, 1);
    assert.equal(list.json().items[0].imageUrl.endsWith('/xiasha/15/image'), true);

    const adminImage = await app.inject({
      method: 'GET',
      url: '/api/admin/roommate-building-groups/xiasha/15/image',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(adminImage.statusCode, 200);
    assert.equal(adminImage.headers['content-type'], 'image/png');
    assert.equal(adminImage.headers['x-content-type-options'], 'nosniff');
    assert.equal(adminImage.headers['cache-control'], 'no-store');

    const unavailable = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/xiasha/15',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(unavailable.statusCode, 503);
    const unavailableImage = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/xiasha/15/image',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(unavailableImage.statusCode, 503);

    const remotePut = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/xiasha/15',
      remoteAddress: '203.0.113.8',
      payload: { mimeType: 'image/png', imageBase64: QR_PNG_BASE64 },
    });
    assert.equal(remotePut.statusCode, 403);
    for (const request of [
      { method: 'GET' as const, url: '/api/admin/roommate-building-groups' },
      { method: 'GET' as const, url: '/api/admin/roommate-building-groups/xiasha/15/image' },
      { method: 'DELETE' as const, url: '/api/admin/roommate-building-groups/xiasha/15' },
    ]) {
      const remote = await app.inject({ ...request, remoteAddress: '203.0.113.8' });
      assert.equal(remote.statusCode, 403);
    }

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/admin/roommate-building-groups/xiasha/15',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json().status, 'deleted');
  });
});

test('serves public QR metadata and image only over HTTPS when matching is enabled', async () => {
  await withApp(true, async (app) => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/xiasha/15',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.deepEqual(missing.json(), {
      campus: 'xiasha', building: '15', available: false, message: '该楼栋群暂未开放',
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/shaoxing/40',
      remoteAddress: '127.0.0.1',
      payload: { mimeType: 'image/png', imageBase64: QR_PNG_BASE64, extra: 'reject' },
    });
    assert.equal(put.statusCode, 400);

    const validPut = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/shaoxing/40',
      remoteAddress: '127.0.0.1',
      payload: { mimeType: 'image/png', imageBase64: QR_PNG_BASE64 },
    });
    assert.equal(validPut.statusCode, 200);

    const metadata = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/shaoxing/040',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(metadata.statusCode, 200);
    assert.deepEqual(metadata.json(), {
      campus: 'shaoxing',
      building: '40',
      available: true,
      imageUrl: '/api/roommates/building-groups/shaoxing/40/image',
      updatedAt: validPut.json().updatedAt,
    });
    assert.equal('imageBase64' in metadata.json(), false);
    assert.equal('updatedBy' in metadata.json(), false);

    const image = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/shaoxing/40/image',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers['content-type'], 'image/png');
    assert.equal(image.headers['x-content-type-options'], 'nosniff');
    assert.equal(image.headers['cache-control'], 'no-store');

    const insecure = await app.inject({
      method: 'GET',
      url: '/api/roommates/building-groups/shaoxing/40/image',
      remoteAddress: '127.0.0.1',
    });
    assert.equal(insecure.statusCode, 403);
  });
});

test('allows a decoded 1 MiB PNG and rejects larger images in business validation', async () => {
  await withApp(false, async (app) => {
    const exact = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/xiasha/1',
      remoteAddress: '127.0.0.1',
      payload: { mimeType: 'image/png', imageBase64: pngBase64OfSize(1024 * 1024) },
    });
    assert.equal(exact.statusCode, 200);

    const oversized = await app.inject({
      method: 'PUT',
      url: '/api/admin/roommate-building-groups/xiasha/2',
      remoteAddress: '127.0.0.1',
      payload: { mimeType: 'image/png', imageBase64: pngBase64OfSize(1024 * 1024 + 1) },
    });
    assert.equal(oversized.statusCode, 400);
    assert.notEqual(oversized.statusCode, 413);
    assert.match(oversized.body, /exceeds 1 MiB/);
  });
});
