// -----------------------------------------------------------------------------
// Scene actions, run as the core runs them (fake.sceneAction with the
// resolved fields): the list is the device external_id the editor offered.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_BRICOLAGE, LIST_COURSES } from './helpers/fakeOurGroceries.js';
import { createWorld, stateOf } from './helpers/world.js';

const listDevice = (gladys, listId) => gladys.externalIds('list', listId).device;

test('add_item puts the item on the list, and the device follows at once', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('add_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: ' Lait d’avoine ',
  });
  assert.deepEqual(ack, {
    success: true,
    data: { outputs: { added: true, item: 'Lait d’avoine' } },
  });
  assert.ok(site.items(LIST_COURSES).some((item) => item.name === 'Lait d’avoine'));
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 5);
  assert.ok(gladys.fake.widgetRefreshes.includes('shopping_list'));
});

test('add_item twice ("out of milk" pressed twice): no duplicate', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('add_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: 'LAIT',
  });
  assert.deepEqual(ack.data.outputs, { added: false, item: 'Lait (2)' });
  assert.deepEqual(site.commands().slice(-1), ['getList'], 'no write');
});

test('add_item brings a crossed-off item back instead of a duplicate', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('add_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: 'cafe',
  });
  assert.deepEqual(ack.data.outputs, { added: true, item: 'Café' });
  const cafes = site.items(LIST_COURSES).filter((item) => item.name === 'Café');
  assert.equal(cafes.length, 1);
  assert.equal(cafes[0].crossedOffAt, undefined);
});

test('add_item refuses a device that is not one of the lists', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('add_item', { list: 'ext:other:list:x', item: 'Sel' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Liste de courses inconnue/);
});

test('add_item refuses an empty name', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('add_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: '   ',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /vide/);
});

test('cross_off_item finds the item by name, whatever the case and accents', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.sceneAction('cross_off_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: 'oeufs',
  });
  assert.deepEqual(ack.data.outputs, { found: true });
  assert.ok(site.items(LIST_COURSES).find((item) => item.id === 'it-0003').crossedOffAt);
  assert.equal(stateOf(gladys, LIST_COURSES, 'remaining'), 3);
  assert.equal(stateOf(gladys, LIST_COURSES, 'crossed_off'), 2);

  const missing = await gladys.fake.sceneAction('cross_off_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: 'Chocolat',
  });
  assert.deepEqual(missing, { success: true, data: { outputs: { found: false } } });
});

test('clear_crossed_off deletes the crossed-off items and says how many', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES, LIST_BRICOLAGE] });
  const ack = await gladys.fake.sceneAction('clear_crossed_off', {
    list: listDevice(gladys, LIST_COURSES),
  });
  assert.deepEqual(ack.data.outputs, { deleted: 1 });
  assert.equal(
    site.items(LIST_COURSES).some((item) => item.name === 'Café'),
    false,
  );
  assert.equal(stateOf(gladys, LIST_COURSES, 'crossed_off'), 0);

  const none = await gladys.fake.sceneAction('clear_crossed_off', {
    list: listDevice(gladys, LIST_BRICOLAGE),
  });
  assert.deepEqual(none.data.outputs, { deleted: 0 });
  assert.equal(site.commands().includes('edit'), true);
  assert.equal(
    site.commands().filter((c) => c === 'edit').length,
    1,
    'nothing to delete: no write',
  );
});

test('a list deleted in OurGroceries is an error the scene logs', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  site.lists.delete(LIST_COURSES);
  await gladys.fake.scanRequest();
  const ack = await gladys.fake.sceneAction('add_item', {
    list: listDevice(gladys, LIST_COURSES),
    item: 'Sel',
  });
  assert.equal(ack.success, false);
});
