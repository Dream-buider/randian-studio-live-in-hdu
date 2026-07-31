import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSessionCookie,
  createSessionToken,
  matchesAccessCode,
  readSessionCookie,
  serializeSessionCookie,
  verifySessionToken,
} from '../src/public-trial/session.js';

const SECRET = 'x'.repeat(32);
const ISSUED_AT = Date.parse('2026-08-01T00:00:00.000Z');

test('public trial access code comparison accepts only the exact code', () => {
  assert.equal(matchesAccessCode('team-code', 'team-code'), true);
  assert.equal(matchesAccessCode('team-code', 'wrong-code'), false);
  assert.equal(matchesAccessCode('team-code', 'team-code '), false);
});

test('public trial HMAC session verifies until its exact expiry boundary', () => {
  const token = createSessionToken({
    sessionId: 'session-1',
    issuedAt: ISSUED_AT,
    expiresAt: ISSUED_AT + 43_200_000,
  }, SECRET);

  assert.equal(
    verifySessionToken(token, SECRET, ISSUED_AT + 43_199_000)?.sessionId,
    'session-1',
  );
  assert.equal(verifySessionToken(token, SECRET, ISSUED_AT + 43_200_000), null);
  assert.equal(verifySessionToken(`${token}tampered`, SECRET, ISSUED_AT), null);
  assert.equal(verifySessionToken(token, 'y'.repeat(32), ISSUED_AT), null);
});

test('public trial cookie is secure, script-inaccessible and scoped to the site', () => {
  const cookie = serializeSessionCookie('signed-token');

  assert.match(cookie, /^live_in_hdu_trial=signed-token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=43200/);
  assert.equal(
    readSessionCookie(`other=value; ${cookie.split(';', 1)[0]}; final=value`),
    'signed-token',
  );
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test('public trial session parser rejects malformed payloads without throwing', () => {
  for (const token of ['', '.', 'a.b', 'not-a-token', 'e30.bad-signature']) {
    assert.equal(verifySessionToken(token, SECRET, ISSUED_AT), null);
  }
  assert.equal(readSessionCookie(undefined), null);
  assert.equal(readSessionCookie('unrelated=value'), null);
});
