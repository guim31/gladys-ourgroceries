// -----------------------------------------------------------------------------
// OurGroceries answers, parsed into the few fields the integration uses.
//
// The shapes come from the web endpoints the official site calls, as read by
// the `ourgroceries` Python library and the Home Assistant integration (see
// test/fixtures/ourgroceries/README.md). Nothing here touches the network.
// -----------------------------------------------------------------------------

import { OurGroceriesError } from './errors.js';

/**
 * `getOverview`: the shopping lists of the account. Recipes are left out:
 * they are not shopping lists.
 * @param {any} json
 * @returns {{ id: string, name: string, versionId: string }[]}
 */
export function parseOverview(json) {
  if (!json || !Array.isArray(json.shoppingLists)) {
    throw new OurGroceriesError('protocol', 'unexpected answer to getOverview');
  }
  return json.shoppingLists
    .filter((list) => list && typeof list.id === 'string' && list.id !== '')
    .map((list) => ({
      id: list.id,
      name: typeof list.name === 'string' && list.name.trim() !== '' ? list.name.trim() : list.id,
      versionId: list.versionId === undefined ? '' : String(list.versionId),
    }));
}

/**
 * `getList`: the items of one list, crossed off or not.
 * @param {any} json
 * @returns {{ versionId: string, items: { id: string, name: string, crossed: boolean, categoryId: string | null }[] }}
 */
export function parseList(json) {
  const list = json?.list;
  if (!list || !Array.isArray(list.items)) {
    throw new OurGroceriesError('protocol', 'unexpected answer to getList');
  }
  const items = [];
  for (const item of list.items) {
    // The Home Assistant integration reads `name`, the Python library writes
    // `value`: both are accepted.
    const name = typeof item?.name === 'string' ? item.name : item?.value;
    if (typeof item?.id !== 'string' || typeof name !== 'string' || name.trim() === '') {
      continue;
    }
    items.push({
      id: item.id,
      name: name.trim(),
      // `crossedOffAt` (a timestamp) is what the site sends; the Python
      // library also knows a `crossedOff` boolean.
      crossed:
        item.crossedOff === true || (item.crossedOffAt !== undefined && item.crossedOffAt !== null),
      categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
    });
  }
  return { versionId: list.versionId === undefined ? '' : String(list.versionId), items };
}

/**
 * The form of a name used to compare items: case, accents, extra spaces and a
 * trailing quantity in parentheses ("Milk (2)") do not count, and ligatures
 * match their spelled-out form ("Œufs" = "oeufs").
 * @param {string} name
 */
export function normalizeItemName(name) {
  return (
    String(name)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      // Ligatures are letters for NFD, not accents: spelled out like people type them.
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss')
      .replace(/\s*\([^()]*\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Find an item by name.
 * @param {{ name: string, crossed: boolean }[]} items
 * @param {string} name
 * @param {{ crossed?: boolean }} [filter] only items in that state
 */
export function findItemByName(items, name, { crossed } = {}) {
  const wanted = normalizeItemName(name);
  if (wanted === '') {
    return undefined;
  }
  return items.find(
    (item) =>
      (crossed === undefined || item.crossed === crossed) &&
      normalizeItemName(item.name) === wanted,
  );
}

/** Items still to buy, in the order of the list. */
export const remainingItems = (list) => list.items.filter((item) => !item.crossed);

/** Items already crossed off. */
export const crossedItems = (list) => list.items.filter((item) => item.crossed);
