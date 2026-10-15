// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// The `list` field is a device of the integration (`source: "devices"`): the
// scene editor only offers the lists the user added to Gladys. Each handler
// receives the fields resolved by the core and returns the declared outputs.
// A scene action is not a condition: an item already on the list is not an
// error, the `added` output says so and the scene author can branch on it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { TEXT } from './i18n.js';

const logger = createLogger({ name: 'scenes' });

/** The OurGroceries list id behind the chosen device, or an error the scene logs. */
function listIdFrom(hub, fields) {
  const listId = hub.resolveListId(fields.list);
  if (!listId) {
    throw new Error(TEXT.unknownList[hub.config.language]);
  }
  return listId;
}

export const SCENE_ACTIONS = {
  /** "Add to the list": a button pressed, "out of milk". */
  async add_item(hub, fields) {
    const listId = listIdFrom(hub, fields);
    const { result, name } = await hub.addItem(listId, fields.item);
    logger.info(`Scene: add "${name}" to list ${listId} -> ${result}`);
    return { added: result !== 'already', item: name };
  },

  /** "Cross off an item", found by name (case and accents do not count). */
  async cross_off_item(hub, fields) {
    const listId = listIdFrom(hub, fields);
    const { found, name } = await hub.crossOff(listId, { name: fields.item });
    logger.info(`Scene: cross off "${name}" on list ${listId} -> ${found ? 'done' : 'not found'}`);
    return { found };
  },

  /** "Clear the crossed-off items": after the shopping trip. */
  async clear_crossed_off(hub, fields) {
    const listId = listIdFrom(hub, fields);
    const deleted = await hub.clearCrossed(listId);
    logger.info(`Scene: clear the crossed-off items of list ${listId} -> ${deleted} deleted`);
    return { deleted };
  },
};
