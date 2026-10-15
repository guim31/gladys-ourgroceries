import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, refreshPeriodMs } from '../src/config.js';
import { createSessionStore } from '../src/session.js';

test('normalizeConfig applies the defaults and cleans the values', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    email: '  a@example.com ',
    password: ' spaced ',
    refresh_minutes: 7,
    language: 'it',
  });
  assert.equal(config.email, 'a@example.com');
  assert.equal(config.password, ' spaced ');
  assert.equal(config.refresh_minutes, '5');
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ refresh_minutes: 15 }).refresh_minutes, '15');
});

test('isConfigured needs both credentials; the period is in milliseconds', () => {
  assert.equal(isConfigured(normalizeConfig({ email: 'a@example.com' })), false);
  assert.equal(isConfigured(normalizeConfig({ email: 'a@example.com', password: 'x' })), true);
  assert.equal(refreshPeriodMs(normalizeConfig()), 5 * 60 * 1000);
});

test('the session file is private, holds no password, and belongs to one account', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'og-session-'));
  const store = createSessionStore({ email: 'A@example.com', dataDir });
  await store.save({ cookie: 'cookie-value', teamId: 'team' });
  const file = join(dataDir, 'session.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const content = await readFile(file, 'utf8');
  assert.equal(content.includes('example.com'), false);
  assert.equal((await store.load()).cookie, 'cookie-value');
  // Same account, other case: same session. Another account: none.
  assert.equal(
    (await createSessionStore({ email: 'a@example.com', dataDir }).load()).teamId,
    'team',
  );
  assert.equal(await createSessionStore({ email: 'b@example.com', dataDir }).load(), null);
  await store.clear();
  assert.equal(await store.load(), null);
});
