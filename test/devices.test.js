import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import {
  FEATURE,
  ITEMS_TEXT_MAX,
  buildDevice,
  buildStates,
  itemsText,
  listIdOf,
} from '../src/devices.js';

const gladys = createFakeGladys();
const list = { id: 'Xk3pQ9rT2vLmN8wYz4aB1c', name: 'Courses', versionId: '1' };
const item = (id, name, crossed = false) => ({ id, name, crossed, categoryId: null });

test('one device per list, keyed on the OurGroceries list id (never the name)', () => {
  const device = buildDevice(gladys, list, normalizeConfig());
  assert.equal(device.external_id, 'ext:test-integration:list:Xk3pQ9rT2vLmN8wYz4aB1c');
  assert.equal(device.name, 'Courses');
  const renamed = buildDevice(gladys, { ...list, name: 'Supermarché' }, normalizeConfig());
  assert.equal(renamed.external_id, device.external_id);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    [FEATURE.REMAINING, FEATURE.CROSSED_OFF, FEATURE.ITEMS],
  );
  assert.ok(device.features.every((f) => f.read_only === true));
});

test('feature names follow the configured language, French by default', () => {
  const names = (language) =>
    buildDevice(gladys, list, normalizeConfig({ language })).features.map((f) => f.name);
  assert.deepEqual(names(undefined), ['Articles à acheter', 'Articles cochés', 'Liste']);
  assert.deepEqual(names('en'), ['Items to buy', 'Crossed-off items', 'List']);
  assert.deepEqual(names('de'), ['Zu kaufende Artikel', 'Abgehakte Artikel', 'Liste']);
  assert.deepEqual(names('es'), ['Artículos por comprar', 'Artículos tachados', 'Lista']);
});

test('listIdOf only knows the devices of the integration', () => {
  assert.equal(listIdOf(gladys, 'ext:test-integration:list:abc'), 'abc');
  assert.equal(listIdOf(gladys, 'ext:other:list:abc'), null);
  assert.equal(listIdOf(gladys, 'ext:test-integration:list:'), null);
  assert.equal(listIdOf(gladys, undefined), null);
});

test('states: counts and the names of the items to buy', () => {
  const parsed = { items: [item('1', 'Lait'), item('2', 'Café', true), item('3', 'Pain')] };
  const states = buildStates(gladys, list.id, parsed, normalizeConfig());
  assert.deepEqual(
    states.map((s) => s.state ?? s.text),
    [2, 1, 'Lait, Pain'],
  );
});

test('the list text is never empty, and stays short', () => {
  assert.equal(itemsText({ items: [] }, 'fr'), 'Plus rien à acheter');
  assert.equal(itemsText({ items: [item('1', 'Milk', true)] }, 'en'), 'Nothing left to buy');
  const long = { items: Array.from({ length: 80 }, (_, i) => item(String(i), `Article ${i}`)) };
  const text = itemsText(long, 'fr');
  assert.equal(text.length, ITEMS_TEXT_MAX);
  assert.ok(text.endsWith('…'));
});
