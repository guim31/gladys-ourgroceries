// -----------------------------------------------------------------------------
// The shopping list widget: contents checked against the core vocabulary and
// budget (validateWidgetContent), the device features they bind to checked
// against the published devices, and the button actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LIST_BRICOLAGE, LIST_COURSES } from './helpers/fakeOurGroceries.js';
import { CONFIG, createWorld } from './helpers/world.js';

const settingsFor = (gladys, listId) => ({ list: gladys.externalIds('list', listId).device });

async function contentOf(gladys, settings, language = 'fr') {
  const ack = await gladys.fake.widgetGet('shopping_list', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
}

const byType = (content, type) => content.components.filter((c) => c.type === type);

test('the list, its count tile and the three buttons, within the core budget', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_COURSES] });
  const content = await contentOf(gladys, settingsFor(gladys, LIST_COURSES));
  assert.deepEqual(validateWidgetContent(content), []);

  assert.equal(byType(content, 'text')[0].text, 'Courses');
  assert.deepEqual(
    byType(content, 'card-list')[0].items.map((item) => item.title),
    ['Lait (2)', 'Pain', 'Œufs', 'Pommes'],
  );
  const [tile] = byType(content, 'value');
  const published = gladys.fake.discoveredDevices.flatMap((d) =>
    d.features.map((f) => f.external_id),
  );
  assert.ok(published.includes(tile.device_feature), 'the tile is bound to a published feature');

  const buttons = byType(content, 'button');
  assert.deepEqual(
    buttons.map((b) => [b.label, b.action.key]),
    [
      ['Ajouter', 'add'],
      ['Cocher', 'cross_off'],
      ['Vider cochés', 'clear_crossed'],
    ],
  );
  assert.deepEqual(
    buttons[1].action.fields[0].options.map((o) => o.value),
    ['it-0001', 'it-0002', 'it-0003', 'it-0005'],
  );
  assert.equal(buttons[2].action.confirm, true);
  // Never signalled by the style alone (invisible in dark mode, Gladys#3153).
  assert.ok(buttons.every((b) => b.icon));
});

test('an empty list says so, without the cross-off and clear buttons', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_BRICOLAGE] });
  const content = await contentOf(gladys, settingsFor(gladys, LIST_BRICOLAGE), 'es');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(byType(content, 'text')[1].text, 'Nada más que comprar');
  assert.deepEqual(
    byType(content, 'button').map((b) => b.action.key),
    ['add'],
  );
});

test('a long list shows 8 rows and how many more, still within the budget', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_BRICOLAGE] });
  for (let i = 1; i <= 12; i += 1) {
    site.addFromApp(LIST_BRICOLAGE, `Article ${i}`);
  }
  await gladys.fake.scanRequest();
  const content = await contentOf(gladys, settingsFor(gladys, LIST_BRICOLAGE), 'de');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(byType(content, 'card-list')[0].items.length, 8);
  assert.equal(byType(content, 'text').at(-1).text, 'Und 4 weitere');
  assert.ok(byType(content, 'text').length <= 2);
});

test('every widget content stays valid in the four languages', async () => {
  const { gladys } = await createWorld({ addedLists: [LIST_COURSES, LIST_BRICOLAGE] });
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const settings of [
      settingsFor(gladys, LIST_COURSES),
      settingsFor(gladys, LIST_BRICOLAGE),
      {},
    ]) {
      assert.deepEqual(validateWidgetContent(await contentOf(gladys, settings, language)), []);
    }
  }
});

test('without a list, or without an account, the widget says what to do', async () => {
  const { gladys } = await createWorld({ config: {} });
  const unconfigured = await contentOf(gladys, {}, 'en');
  assert.match(byType(unconfigured, 'text')[0].text, /email and password/);

  const world = await createWorld();
  const noList = await contentOf(world.gladys, {}, 'en');
  assert.match(byType(noList, 'text')[0].text, /Choose a shopping list/);
});

test('OurGroceries down: the last list read, else a sentence, never an error', async () => {
  let clock = Date.parse('2026-10-15T08:00:00Z');
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES], now: () => clock });
  site.failure = 'network';
  // Fresh cache: the widget shows it without asking.
  const cached = await contentOf(gladys, settingsFor(gladys, LIST_COURSES), 'en');
  assert.equal(byType(cached, 'card-list').length, 1);
  // Stale cache: asked again, no answer, the last list read stays.
  clock += 30 * 60 * 1000;
  const stale = await contentOf(gladys, settingsFor(gladys, LIST_COURSES), 'en');
  assert.equal(byType(stale, 'card-list')[0].items.length, 4);
  // A list never read: the widget asks, gets nothing, says so.
  const content = await contentOf(gladys, settingsFor(gladys, LIST_BRICOLAGE), 'en');
  assert.match(byType(content, 'text')[0].text, /does not answer/);
});

test('Add, Cross off and Clear crossed act on the list and answer in four languages', async () => {
  const { gladys, site } = await createWorld({
    config: { ...CONFIG, language: 'en' },
    addedLists: [LIST_COURSES],
  });
  const settings = settingsFor(gladys, LIST_COURSES);

  const added = await gladys.fake.widgetAction(
    'shopping_list',
    'add',
    {},
    {
      settings,
      values: { item: 'Beurre' },
    },
  );
  assert.equal(added.success, true);
  assert.deepEqual(added.data, {
    message: {
      en: 'Added: Beurre',
      fr: 'Ajouté : Beurre',
      de: 'Hinzugefügt: Beurre',
      es: 'Añadido: Beurre',
    },
  });

  const again = await gladys.fake.widgetAction(
    'shopping_list',
    'add',
    {},
    {
      settings,
      values: { item: 'beurre' },
    },
  );
  assert.equal(again.data.message.fr, 'Déjà sur la liste : Beurre');

  const crossed = await gladys.fake.widgetAction(
    'shopping_list',
    'cross_off',
    {},
    {
      settings,
      values: { item: 'it-0002' },
    },
  );
  assert.equal(crossed.data.message.fr, 'Coché : Pain');
  assert.ok(site.items(LIST_COURSES).find((item) => item.id === 'it-0002').crossedOffAt);

  // The select was built before: the item has been crossed off since.
  const stale = await gladys.fake.widgetAction(
    'shopping_list',
    'cross_off',
    {},
    {
      settings,
      values: { item: 'it-0002' },
    },
  );
  assert.equal(stale.data.message.en, 'This item is no longer on the list.');

  const cleared = await gladys.fake.widgetAction(
    'shopping_list',
    'clear_crossed',
    {},
    {
      settings,
    },
  );
  assert.equal(cleared.data.message.es, '2 artículo(s) tachado(s) eliminado(s).');
  const nothing = await gladys.fake.widgetAction(
    'shopping_list',
    'clear_crossed',
    {},
    {
      settings,
    },
  );
  assert.equal(nothing.data.message.de, 'Kein abgehakter Artikel zum Löschen.');
});

test('an Add received without its form values (older core) is refused', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.widgetAction(
    'shopping_list',
    'add',
    {},
    {
      settings: settingsFor(gladys, LIST_COURSES),
    },
  );
  assert.equal(ack.data.message.en, 'The item name is empty.');
  assert.equal(site.commands().includes('insertItem'), false);
});
