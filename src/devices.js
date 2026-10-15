// -----------------------------------------------------------------------------
// One Gladys device per OurGroceries shopping list.
//
// External ids are forever: `list:<OurGroceries list id>`, the id the service
// gives the list (a renamed list keeps its device). Three read-only features:
//   - items to buy (the count of items not crossed off),
//   - crossed-off items (still on the list, waiting to be cleared),
//   - the list itself, as a text (the names of the items to buy).
//
// Polling: the core is asked to poll once a minute (`should_poll` with a
// valid `poll_frequency`), but the container refreshes on its own timer
// (src/hub.js) because the core cannot be trusted to (Gladys#3198); the
// core's onPoll is a fallback, skipped while the timer runs.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, TEXT, pickLanguage, textIn } from './i18n.js';
import { crossedItems, remainingItems } from './ourgroceries/model.js';

export const DEVICE_TYPE = 'list';

export const FEATURE = {
  REMAINING: 'remaining',
  CROSSED_OFF: 'crossed_off',
  ITEMS: 'items',
};

// Display bounds of the counters (NOT NULL in Gladys, never applied on write).
const COUNT_MAX = 500;
// The text of the list stays readable in a notification.
export const ITEMS_TEXT_MAX = 255;

/** External ids of a list's device. */
export const listIds = (gladys, listId) => gladys.externalIds(DEVICE_TYPE, listId);

/** OurGroceries list id of a device external id, or null if it is not one of ours. */
export function listIdOf(gladys, externalId) {
  const prefix = `${gladys.externalId(DEVICE_TYPE)}:`;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  return rest === '' ? null : rest;
}

/**
 * The device of one list, for the Discovery tab.
 * @param {object} gladys
 * @param {{ id: string, name: string }} list
 * @param {object} config normalized config (language of the feature names)
 */
export function buildDevice(gladys, list, config) {
  const ids = listIds(gladys, list.id);
  const names = FEATURE_NAMES[pickLanguage(config.language)];
  const counter = (key) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    min: 0,
    max: COUNT_MAX,
  });
  return {
    name: list.name,
    external_id: ids.device,
    model: 'OurGroceries',
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      counter(FEATURE.REMAINING),
      counter(FEATURE.CROSSED_OFF),
      {
        name: names[FEATURE.ITEMS],
        external_id: ids.feature(FEATURE.ITEMS),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        // NOT NULL in Gladys, even for a text: 0/0 like Zigbee2MQTT.
        min: 0,
        max: 0,
      },
    ],
  };
}

/**
 * The names of the items to buy, joined; never empty (Gladys ignores an
 * empty text), cut at ITEMS_TEXT_MAX characters.
 */
export function itemsText(list, language) {
  const names = remainingItems(list).map((item) => item.name);
  if (names.length === 0) {
    return textIn(TEXT.emptyList, language);
  }
  const text = names.join(', ');
  return text.length <= ITEMS_TEXT_MAX ? text : `${text.slice(0, ITEMS_TEXT_MAX - 1)}…`;
}

/**
 * The states of one list, in the publishStates format.
 * @param {object} gladys
 * @param {string} listId
 * @param {{ items: object[] }} list parsed list
 * @param {object} config
 */
export function buildStates(gladys, listId, list, config) {
  const ids = listIds(gladys, listId);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE.REMAINING),
      state: remainingItems(list).length,
    },
    {
      device_feature_external_id: ids.feature(FEATURE.CROSSED_OFF),
      state: crossedItems(list).length,
    },
    {
      device_feature_external_id: ids.feature(FEATURE.ITEMS),
      text: itemsText(list, config.language),
    },
  ];
}
