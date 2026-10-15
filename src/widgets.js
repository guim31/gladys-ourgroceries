// -----------------------------------------------------------------------------
// The "Shopping list" dashboard widget (manifest `widgets`, Gladys 5.2+).
//
// The core's widget vocabulary has no checkbox and no text input on the card,
// by design: the items to buy are a list (card-list, 8 rows at most), and the
// writes sit behind buttons that open a form (Gladys 5.2.0, #3168):
//   - Add: a text field;
//   - Cross off: a select of the items to buy (the "checkboxes");
//   - Clear crossed: delete the crossed-off items, after a confirmation.
// The count of items to buy is a tile bound to the device feature: it follows
// the published states live.
//
// Budget of the core: 8 components, 2 texts (1 body), 1 focal, 4 buttons.
// The core looks the tapped action up in the content it cached: a select
// built a few minutes ago may name an item crossed off since, which the
// action handler answers with a sentence, not an error.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { refreshPeriodMs } from './config.js';
import { FEATURE, listIds } from './devices.js';
import { MESSAGES, TEXT, message, textIn } from './i18n.js';
import { crossedItems, remainingItems } from './ourgroceries/model.js';

const logger = createLogger({ name: 'widget' });

export const WIDGET_KEY = 'shopping_list';
export const ACTION = { ADD: 'add', CROSS_OFF: 'cross_off', CLEAR: 'clear_crossed' };

const MAX_ROWS = 8;
// A select longer than this is no longer usable on a phone.
const MAX_OPTIONS = 50;

const caption = (text) => ({ type: 'text', variant: 'caption', text });

/**
 * The content for one list.
 * @param {object} options
 * @param {object} options.gladys
 * @param {string} options.listId
 * @param {{ name: string, items: object[] }} options.list
 * @param {string} options.language
 * @param {number} [options.ttlSeconds]
 */
export function buildListContent({ gladys, listId, list, language, ttlSeconds = 300 }) {
  const remaining = remainingItems(list);
  const crossed = crossedItems(list);
  const components = [
    { type: 'text', variant: 'heading', text: list.name.slice(0, 40) },
    {
      type: 'value',
      label: textIn(TEXT.toBuy, language),
      icon: 'shopping-cart',
      device_feature: listIds(gladys, listId).feature(FEATURE.REMAINING),
    },
  ];
  if (remaining.length === 0) {
    components.push({ type: 'text', variant: 'body', text: textIn(TEXT.emptyList, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: remaining.slice(0, MAX_ROWS).map((item) => ({ title: item.name.slice(0, 60) })),
    });
    if (remaining.length > MAX_ROWS) {
      components.push(caption(MESSAGES.more[language](remaining.length - MAX_ROWS)));
    }
  }
  components.push({
    type: 'button',
    label: textIn(TEXT.add, language),
    icon: 'plus',
    action: {
      key: ACTION.ADD,
      fields: [
        {
          key: 'item',
          type: 'string',
          required: true,
          label: { en: TEXT.itemField.en, [language]: textIn(TEXT.itemField, language) },
          placeholder: {
            en: TEXT.itemPlaceholder.en,
            [language]: textIn(TEXT.itemPlaceholder, language),
          },
        },
      ],
    },
  });
  if (remaining.length > 0) {
    components.push({
      type: 'button',
      label: textIn(TEXT.crossOff, language),
      icon: 'check-square',
      action: {
        key: ACTION.CROSS_OFF,
        fields: [
          {
            key: 'item',
            type: 'select',
            required: true,
            label: {
              en: TEXT.itemToCrossOff.en,
              [language]: textIn(TEXT.itemToCrossOff, language),
            },
            options: remaining
              .slice(0, MAX_OPTIONS)
              .map((item) => ({ value: item.id, label: { en: item.name.slice(0, 60) } })),
          },
        ],
      },
    });
  }
  if (crossed.length > 0) {
    components.push({
      type: 'button',
      label: textIn(TEXT.clearCrossed, language),
      icon: 'trash-2',
      style: 'danger',
      action: { key: ACTION.CLEAR, confirm: true },
    });
  }
  return { ttl_seconds: ttlSeconds, components };
}

/** A sentence instead of a list (not configured, no list chosen, unreachable…). */
export const sentenceContent = (text, language, ttlSeconds = 60) => ({
  ttl_seconds: ttlSeconds,
  components: [{ type: 'text', variant: 'body', text: textIn(text, language) }],
});

/**
 * Handlers of the widget, bound to the hub.
 * @param {object} gladys
 * @param {object} hub
 * @param {{ fail(key: string, message: string): void, ok(key: string, message: string): void }} issues
 */
export function createWidget(gladys, hub, issues) {
  return {
    async get({ settings = {}, language }) {
      const config = hub.config;
      if (!config || hub.status === 'not_configured') {
        return sentenceContent(TEXT.notConfigured, language);
      }
      if (hub.status === 'auth') {
        return sentenceContent(TEXT.authFailed, language);
      }
      const listId = hub.resolveListId(settings.list);
      if (!listId) {
        return sentenceContent(TEXT.pickList, language);
      }
      try {
        const list = await hub.getList(listId);
        issues.ok('widget', 'Shopping list widget: OurGroceries answers again');
        if (!list) {
          return sentenceContent(TEXT.listGone, language, 300);
        }
        const ttlSeconds = Math.min(3600, Math.round(refreshPeriodMs(config) / 1000));
        return buildListContent({ gladys, listId, list, language, ttlSeconds });
      } catch (err) {
        issues.fail('widget', `Shopping list widget: ${err.message}`);
        return sentenceContent(TEXT.unreachable, language);
      }
    },

    async action(actionKey, _params, { settings = {}, values } = {}) {
      const listId = hub.resolveListId(settings.list);
      if (!listId) {
        return TEXT.pickList;
      }
      if (actionKey === ACTION.ADD) {
        // An older core drops the form: refuse an action without its values.
        if (typeof values?.item !== 'string') {
          return TEXT.emptyItem;
        }
        const { result, name } = await hub.addItem(listId, values.item);
        logger.info(`Widget: add "${name}" to list ${listId} -> ${result}`);
        const table = { added: MESSAGES.added, restored: MESSAGES.restored }[result];
        return message(table ?? MESSAGES.alreadyThere, name);
      }
      if (actionKey === ACTION.CROSS_OFF) {
        if (typeof values?.item !== 'string') {
          return TEXT.itemGone;
        }
        const { found, name } = await hub.crossOff(listId, { itemId: values.item });
        logger.info(`Widget: cross off on list ${listId} -> ${found ? name : 'not found'}`);
        return found ? message(MESSAGES.crossedOff, name) : TEXT.itemGone;
      }
      if (actionKey === ACTION.CLEAR) {
        const deleted = await hub.clearCrossed(listId);
        logger.info(`Widget: clear the crossed-off items of list ${listId} -> ${deleted} deleted`);
        return deleted > 0 ? message(MESSAGES.cleared, deleted) : TEXT.nothingToClear;
      }
      throw new Error(`Unknown widget action ${actionKey}`);
    },
  };
}
