// -----------------------------------------------------------------------------
// Refreshing: the container's own timer (the core cannot be trusted to poll,
// Gladys#3198), the core's onPoll as a fallback, the states of a device just
// added, the heartbeat, the errors, and the `item_added` trigger.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEARTBEAT_MS } from '../src/hub.js';
import { LIST_BRICOLAGE, LIST_COURSES, PASSWORD } from './helpers/fakeOurGroceries.js';
import { CONFIG, createWorld, deviceOf, stateOf } from './helpers/world.js';

const MINUTE = 60 * 1000;

/** Let the promise chains of a fired timer run to their end (a renewed session adds round trips). */
async function settle() {
  for (let i = 0; i < 400; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function useClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  return {
    async advance(ms) {
      t.mock.timers.tick(ms);
      await settle();
    },
  };
}

test('the states refresh on the container timer, without onPoll', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  let onPollCalls = 0;
  t.mock.method(app.hub, 'pollFromCore', async () => {
    onPollCalls += 1;
  });
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4);

  site.addFromApp(LIST_COURSES, 'Beurre');
  await clock.advance(4 * MINUTE);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4, 'not before the period');
  await clock.advance(1 * MINUTE);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
  assert.equal(stateOf(gladys, LIST_COURSES, 'items'), 'Lait (2), Pain, Œufs, Pommes, Beurre');

  site.addFromApp(LIST_COURSES, 'Sel');
  await clock.advance(5 * MINUTE);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 6, 'and again, period after period');
  assert.equal(onPollCalls, 0);
  app.stop();
});

test('the period follows the configuration', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({
    config: { ...CONFIG, refresh_minutes: '15' },
    addedLists: [LIST_COURSES],
    timers: true,
  });
  site.addFromApp(LIST_COURSES, 'Beurre');
  await clock.advance(10 * MINUTE);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4);
  await clock.advance(5 * MINUTE);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
  app.stop();
});

test('a quiet account costs one request per period, the lists not added none', async (t) => {
  const clock = useClock(t);
  const { site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  assert.deepEqual(site.commands(), ['getOverview', 'getList']);
  site.requests.length = 0;
  await clock.advance(5 * MINUTE);
  assert.deepEqual(site.commands(), ['getOverview'], 'unchanged version: no getList');
  site.addFromApp(LIST_BRICOLAGE, 'Vis'); // a list not added to Gladys
  site.requests.length = 0;
  await clock.advance(5 * MINUTE);
  assert.deepEqual(site.commands(), ['getOverview']);
  app.stop();
});

test('the core onPoll is skipped while the timer keeps up, and takes over when it stalls', async () => {
  let clock = Date.parse('2026-10-15T08:00:00Z');
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES], now: () => clock });
  const device = deviceOf(gladys, LIST_COURSES);
  site.requests.length = 0;

  clock += 2 * MINUTE;
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.deepEqual(site.commands(), [], 'polled 2 minutes ago: skipped');

  site.addFromApp(LIST_COURSES, 'Beurre');
  clock += 4 * MINUTE; // the timer is late
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.deepEqual(site.commands(), ['getOverview', 'getList']);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
});

test('a list just added to Gladys gets all its states at once, and the widget a nudge', async () => {
  const { gladys } = await createWorld();
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), undefined, 'not added: no state');
  await gladys.fake.deviceCreated(deviceOf(gladys, LIST_COURSES));
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4);
  assert.equal(stateOf(gladys, LIST_COURSES, 'crossed_off'), 1);
  assert.equal(stateOf(gladys, LIST_COURSES, 'items'), 'Lait (2), Pain, Œufs, Pommes');
  assert.ok(gladys.fake.widgetRefreshes.includes('shopping_list'));

  // Updated (renamed in Gladys…): Gladys may have lost them, everything again.
  const before = gladys.fake.states.length;
  await gladys.fake.deviceUpdated(deviceOf(gladys, LIST_COURSES));
  assert.equal(gladys.fake.states.length, before + 3);
});

test('only changes are published, plus a heartbeat every 6 hours', async (t) => {
  const clock = useClock(t);
  const { gladys, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  const feature = gladys.externalIds('list', LIST_COURSES).feature('remaining');
  const count = () => gladys.fake.states.filter((s) => s.device_feature_external_id === feature);
  assert.equal(count().length, 1);
  for (let elapsed = 0; elapsed < HEARTBEAT_MS - 5 * MINUTE; elapsed += 5 * MINUTE) {
    await clock.advance(5 * MINUTE);
  }
  assert.equal(count().length, 1, 'unchanged: not sent again before the heartbeat');
  await clock.advance(10 * MINUTE);
  assert.equal(count().length, 2, 'heartbeat');
  assert.equal(count()[1].state, 4);
  app.stop();
});

test('refused credentials: said in Gladys, no automatic retry, a new password resumes', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({
    config: { ...CONFIG, password: 'wrong' },
    addedLists: [LIST_COURSES],
    timers: true,
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé l’e-mail ou le mot de passe/);
  assert.equal(site.requests.length, 1, 'one sign-in attempt');

  await clock.advance(60 * MINUTE);
  assert.equal(site.requests.length, 1, 'no retry with the same password');

  await gladys.fake.configUpdated({ ...CONFIG, password: PASSWORD });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4);
  app.stop();
});

test('not configured: Gladys says what to fill in, nothing is requested', async () => {
  const { gladys, site } = await createWorld({ config: {} });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /email and password/);
  assert.equal(site.requests.length, 0);
});

test('OurGroceries down: unreachable status, retried every period, back by itself', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  site.failure = 'network';
  await clock.advance(5 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable/);
  site.failure = null;
  site.addFromApp(LIST_COURSES, 'Beurre');
  await clock.advance(5 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
  app.stop();
});

test('an item added from the app fires item_added with its name and list', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first read is the baseline');

  site.addFromApp(LIST_COURSES, 'Beurre');
  // Restored from the crossed-off items: back on the list, an addition too.
  site.edit(LIST_COURSES, (list) => {
    delete list.items.find((item) => item.id === 'it-0004').crossedOffAt;
  });
  // Crossed off: not an addition.
  site.edit(LIST_COURSES, (list) => {
    list.items.find((item) => item.id === 'it-0002').crossedOffAt = 1760000000;
  });
  await clock.advance(5 * MINUTE);

  const device = gladys.externalIds('list', LIST_COURSES).device;
  assert.deepEqual(gladys.fake.sceneEvents, [
    { key: 'item_added', data: { list: device, item: 'Café', list_name: 'Courses' } },
    { key: 'item_added', data: { list: device, item: 'Beurre', list_name: 'Courses' } },
  ]);
  app.stop();
});

test('items added by Gladys itself do not fire item_added (no scene loop)', async () => {
  const { gladys, hub } = await createWorld({ addedLists: [LIST_COURSES] });
  await hub.addItem(LIST_COURSES, 'Beurre'); // a scene, or the widget
  await hub.addItem(LIST_COURSES, 'café'); // restored from the crossed-off items
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a new list in the account appears in the Discovery tab at the next refresh', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ timers: true });
  site.lists.set('Nw1list', { id: 'Nw1list', name: 'Pharmacie', versionId: 'a', items: [] });
  await clock.advance(5 * MINUTE);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Courses', 'Bricolage', 'Pharmacie'],
  );
  app.stop();
});

test('a list deleted in OurGroceries keeps its device, without updates', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  site.lists.delete(LIST_COURSES);
  await clock.advance(5 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 4);
  app.stop();
});

test('a new language re-sends the list text in it', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_BRICOLAGE] });
  assert.equal(stateOf(gladys, LIST_BRICOLAGE, 'items'), 'Plus rien à acheter');
  await gladys.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.equal(stateOf(gladys, LIST_BRICOLAGE, 'items'), 'Nichts mehr zu kaufen');
  assert.equal(site.signIns, 1, 'same account: same session');
});

test('after a reconnection to Gladys, the status and the Discovery tab are sent again', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_COURSES] });
  const statuses = gladys.fake.connectionStatuses.length;
  const discoveries = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatuses.length, statuses + 1);
  assert.equal(
    gladys.fake.requests.filter((r) => r.path === '/discovered_device').length,
    discoveries + 1,
  );
});

test('a session ended on the site (HTTP 400, as the real site answers) is renewed silently', async (t) => {
  const clock = useClock(t);
  const { gladys, site, app } = await createWorld({ addedLists: [LIST_COURSES], timers: true });
  site.expireSessions();
  site.addFromApp(LIST_COURSES, 'Beurre');
  await clock.advance(5 * MINUTE);
  assert.equal(site.signIns, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
  app.stop();
});
