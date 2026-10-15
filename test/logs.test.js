// -----------------------------------------------------------------------------
// Quiet logs: a normal refresh writes nothing at the info level, a repeated
// error is said once and its recovery once, and no secret of the
// configuration (nor the session cookie) ever reaches the logs, even in debug.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_COURSES, PASSWORD } from './helpers/fakeOurGroceries.js';
import { CONFIG, createWorld } from './helpers/world.js';

const MINUTE = 60 * 1000;

async function settle() {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Every log line written during the test, at the debug level. */
function captureLogs(t) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const record = (...args) =>
    lines.push(args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  return {
    lines,
    at: (level) => lines.filter((line) => line.includes(`[${level.toUpperCase()}]`)),
  };
}

test('a normal refresh cycle writes nothing at the info level', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  const logs = captureLogs(t);
  const { site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  const startup = logs.at('info').length;
  assert.ok(startup >= 1, 'the connection is said once');

  site.addFromApp(LIST_COURSES, 'Beurre');
  for (let i = 0; i < 6; i += 1) {
    t.mock.timers.tick(5 * MINUTE);
    await settle();
  }
  assert.deepEqual(logs.at('info').slice(startup), []);
  assert.deepEqual(logs.at('warn'), []);
  assert.deepEqual(logs.at('error'), []);
  app.stop();
});

test('an outage is said once, and its end once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  const logs = captureLogs(t);
  const { site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  const infoBefore = logs.at('info').length;
  site.failure = 'network';
  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(5 * MINUTE);
    await settle();
  }
  assert.equal(logs.at('warn').length, 1, logs.at('warn').join('\n'));
  site.failure = null;
  t.mock.timers.tick(5 * MINUTE);
  await settle();
  const recovered = logs.at('info').slice(infoBefore);
  assert.equal(recovered.length, 1);
  assert.match(recovered[0], /answers again/);
  app.stop();
});

test('no password, email or session cookie in the logs, whatever happens', async (t) => {
  const logs = captureLogs(t);
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const device = gladys.externalIds('list', LIST_COURSES).device;
  await gladys.fake.sceneAction('add_item', { list: device, item: 'Beurre' });
  await gladys.fake.action('test_and_refresh', {});
  site.expireSessions();
  await gladys.fake.scanRequest();
  site.failure = 'network';
  await gladys.fake.scanRequest().catch(() => {});
  site.failure = null;
  await gladys.fake.configUpdated({ ...CONFIG, password: 'Wr0ng-Pa55word!' });
  await gladys.fake.action('test_and_refresh', {});

  const all = logs.lines.join('\n');
  assert.ok(logs.lines.length > 5, 'the scenario did log');
  for (const secret of [PASSWORD, 'Wr0ng-Pa55word!', CONFIG.email, 'session-1', 'session-2']) {
    assert.equal(all.includes(secret), false, `"${secret}" found in the logs`);
  }
});
