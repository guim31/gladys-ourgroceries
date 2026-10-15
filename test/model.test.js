import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  crossedItems,
  findItemByName,
  normalizeItemName,
  parseList,
  parseOverview,
  remainingItems,
} from '../src/ourgroceries/model.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/ourgroceries/${name}`, import.meta.url), 'utf8'));

test('parseOverview keeps the shopping lists, not the recipes', async () => {
  const lists = parseOverview(await fixture('overview.json'));
  assert.deepEqual(lists, [
    { id: 'Xk3pQ9rT2vLmN8wYz4aB1c', name: 'Courses', versionId: '7Hq2Lp9sKd3mWx' },
    { id: 'Rf6tG1hJ8kZq0pLs5nVb2m', name: 'Bricolage', versionId: '2Bn8Vc4xZq1aSd' },
  ]);
  assert.throws(() => parseOverview({}), { code: 'protocol' });
});

test('parseList reads the Home Assistant test shapes too', () => {
  // tests/components/ourgroceries of Home Assistant: name, crossedOffAt.
  const list = parseList({
    list: {
      versionId: '1',
      items: [
        { id: '12345', name: 'Soda' },
        { id: '54321', name: 'Milk', crossedOffAt: 1699107501 },
        { id: '1', value: 'Bread' },
        { id: '2', name: 'Eggs', crossedOff: true },
        { id: '3', name: '   ' },
        { name: 'no id' },
      ],
    },
  });
  assert.deepEqual(
    list.items.map((item) => [item.name, item.crossed]),
    [
      ['Soda', false],
      ['Milk', true],
      ['Bread', false],
      ['Eggs', true],
    ],
  );
  assert.equal(remainingItems(list).length, 2);
  assert.equal(crossedItems(list).length, 2);
  assert.throws(() => parseList({ list: {} }), { code: 'protocol' });
});

test('an empty list is a list', async () => {
  const list = parseList(await fixture('list-bricolage.json'));
  assert.deepEqual(list.items, []);
});

test('item names compare without case, accents, spaces or quantity', () => {
  assert.equal(normalizeItemName('  Lait  (2) '), 'lait');
  assert.equal(normalizeItemName('CAFÉ'), 'cafe');
  assert.equal(normalizeItemName('Œufs'), 'oeufs');
  assert.equal(normalizeItemName('Weißbier'), 'weissbier');
  assert.equal(normalizeItemName('Pommes   de terre'), 'pommes de terre');
});

test('findItemByName filters on the crossed state', async () => {
  const { items } = parseList(await fixture('list-courses.json'));
  assert.equal(findItemByName(items, 'lait')?.id, 'it-0001');
  assert.equal(findItemByName(items, 'oeufs')?.id, 'it-0003');
  assert.equal(findItemByName(items, 'Œufs')?.id, 'it-0003');
  assert.equal(findItemByName(items, 'cafe', { crossed: false }), undefined);
  assert.equal(findItemByName(items, 'cafe', { crossed: true })?.id, 'it-0004');
  assert.equal(findItemByName(items, ''), undefined);
});
