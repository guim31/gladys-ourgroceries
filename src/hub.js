// -----------------------------------------------------------------------------
// The hub: what the integration knows about the OurGroceries account, and
// every read and write against it.
//
// Refreshing. One cycle reads the overview of the account (one request: the
// lists and their version), then the items of each list the user added to
// Gladys, only when its version changed — so a quiet account costs one
// request per period. The container runs the cycle on its own timer, every
// `refresh_minutes`: the core cannot be trusted to poll an external device
// (Gladys#3198, a device keeps the polling fields it was created with). The
// core's onPoll stays as a fallback, skipped while the timer keeps up.
//
// States. Only changes are published (publishChangedStates), with a
// heartbeat every 6 hours so a quiet list keeps a recent value in Gladys
// (the interface says "no recent value" after 48 hours). A device the user
// just added gets all its states at once: Gladys dropped the ones published
// before the device existed.
//
// Errors. Credentials refused: said once, then no more automatic sign-in
// until the configuration changes (or the user asks): retrying a refused
// password is how accounts get locked. No answer: said once, retried every
// period, its recovery said once.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, refreshPeriodMs } from './config.js';
import { buildDevice, buildStates, listIds, listIdOf } from './devices.js';
import { MESSAGES, TEXT, message } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createClient } from './ourgroceries/client.js';
import { isAuthError, OurGroceriesError } from './ourgroceries/errors.js';
import { crossedItems, findItemByName, normalizeItemName } from './ourgroceries/model.js';
import { createSessionStore, DEFAULT_DATA_DIR } from './session.js';
import { WIDGET_KEY } from './widgets.js';

const logger = createLogger({ name: 'ourgroceries' });

export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
export const TRIGGER = { ITEM_ADDED: 'item_added' };
// One cycle never fires more events than this per list (a list pasted at once).
const MAX_EVENTS_PER_LIST = 10;
// How long an item added by the integration itself is not reported as added
// by someone else (no loop through a scene bound to the trigger).
const SELF_ADDED_TTL_MS = 60 * 60 * 1000;

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {string} [options.dataDir]
 * @param {typeof fetch} [options.fetch]
 * @param {boolean} [options.timers] run the refresh timer (tests turn it off)
 * @param {() => number} [options.now]
 */
export function createHub({
  gladys,
  dataDir = DEFAULT_DATA_DIR,
  fetch = globalThis.fetch,
  timers = true,
  now = () => Date.now(),
}) {
  const issues = createIssueLog(logger);
  let config = null;
  let client = null;
  /** Shopping lists of the account: [{ id, name, versionId }], null before the first read. */
  let lists = null;
  /** Items of the lists read so far: listId → { versionId, items, fetchedAt }. */
  const cache = new Map();
  /** Normalized names the integration added itself: listId → Map(name → time). */
  const selfAdded = new Map();
  /** What the Discovery tab last received (`id:name` of every list). */
  let publishedSignature = null;
  /** 'ok' | 'auth' | 'unreachable' | 'not_configured' | null (not yet known). */
  let status = null;
  let lastConnectionStatus = null;
  let authBlocked = false;
  let lastCycleAt = null;
  let cycleInFlight = null;
  let timer = null;
  let stopped = false;

  // --- Gladys side ------------------------------------------------------------

  /** OurGroceries ids of the lists the user added to Gladys. */
  function addedListIds() {
    return (gladys.devices ?? [])
      .map((device) => listIdOf(gladys, device.external_id))
      .filter((id) => id !== null);
  }

  async function reportConnection(ok, text) {
    const key = ok ? 'ok' : JSON.stringify(text);
    if (key === lastConnectionStatus) {
      return;
    }
    lastConnectionStatus = key;
    await gladys.setConnectionStatus(ok, ok ? undefined : text).catch((err) => {
      lastConnectionStatus = null;
      logger.debug(`setConnectionStatus failed (${err.message})`);
    });
  }

  async function publishDiscovered({ force = false } = {}) {
    if (lists === null) {
      return;
    }
    const signature = lists.map((list) => `${list.id}:${list.name}`).join('\n');
    if (!force && signature === publishedSignature) {
      return;
    }
    await gladys.publishDiscoveredDevices(lists.map((list) => buildDevice(gladys, list, config)));
    publishedSignature = signature;
  }

  async function publishList(listId) {
    const list = cache.get(listId);
    if (!list) {
      return;
    }
    await gladys.publishChangedStates(buildStates(gladys, listId, list, config), {
      heartbeat: HEARTBEAT_MS,
    });
  }

  function refreshWidget() {
    try {
      // Rate-limited by the core (1 per 10 s): a refused nudge only delays the card.
      Promise.resolve(gladys.requestWidgetRefresh(WIDGET_KEY)).catch((err) =>
        logger.debug(`requestWidgetRefresh failed (${err.message})`),
      );
    } catch (err) {
      logger.debug(`requestWidgetRefresh failed (${err.message})`);
    }
  }

  // --- OurGroceries side --------------------------------------------------------

  function requireClient() {
    if (!client) {
      throw new OurGroceriesError('auth', 'the OurGroceries account is not configured');
    }
    return client;
  }

  /**
   * Read the items of one list into the cache, firing `item_added` for the
   * items that appeared since the previous read.
   * @returns {Promise<boolean>} whether the list changed
   */
  async function fetchList(listId) {
    const previous = cache.get(listId);
    const list = await requireClient().getList(listId);
    const overviewVersion = lists?.find((entry) => entry.id === listId)?.versionId;
    cache.set(listId, {
      versionId: list.versionId || overviewVersion || '',
      items: list.items,
      fetchedAt: now(),
    });
    if (previous) {
      await fireItemAdded(listId, previous.items, list.items);
    }
    return !previous || JSON.stringify(previous.items) !== JSON.stringify(list.items);
  }

  async function fireItemAdded(listId, before, after) {
    const wasActive = new Set(before.filter((item) => !item.crossed).map((item) => item.id));
    const ownNames = selfAdded.get(listId) ?? new Map();
    for (const [name, at] of ownNames) {
      if (now() - at > SELF_ADDED_TTL_MS) {
        ownNames.delete(name);
      }
    }
    const appeared = after.filter((item) => !item.crossed && !wasActive.has(item.id));
    let fired = 0;
    for (const item of appeared) {
      const key = normalizeItemName(item.name);
      if (ownNames.has(key)) {
        ownNames.delete(key); // added by a scene or the widget: not an event
        continue;
      }
      if (fired >= MAX_EVENTS_PER_LIST) {
        logger.debug(`${listId}: more items appeared, events capped`);
        break;
      }
      fired += 1;
      await gladys
        .publishSceneEvent(TRIGGER.ITEM_ADDED, {
          list: listIds(gladys, listId).device,
          item: item.name,
          list_name: lists?.find((entry) => entry.id === listId)?.name ?? '',
        })
        .catch((err) => logger.warn(`item_added event refused (${err.message})`));
    }
  }

  function rememberSelfAdded(listId, name) {
    if (!selfAdded.has(listId)) {
      selfAdded.set(listId, new Map());
    }
    selfAdded.get(listId).set(normalizeItemName(name), now());
  }

  /** The error, said once while it lasts, and the status Gladys shows. */
  async function failed(err) {
    if (isAuthError(err)) {
      authBlocked = true;
      if (status !== 'auth') {
        logger.error(`OurGroceries sign-in refused: ${err.message}`);
      }
      status = 'auth';
      await reportConnection(false, TEXT.authFailed);
      return;
    }
    issues.fail('refresh', `OurGroceries refresh failed (${err.message})`);
    status = 'unreachable';
    await reportConnection(false, message(MESSAGES.unreachableStatus, err.message));
  }

  async function succeeded() {
    if (status !== 'ok') {
      if (issues.isFailing('refresh')) {
        issues.ok('refresh', 'OurGroceries answers again');
      } else {
        logger.info(`Connected to OurGroceries: ${lists.length} shopping list(s)`);
      }
    }
    status = 'ok';
    await reportConnection(true);
  }

  /**
   * One refresh: overview, then the added lists whose version changed.
   * @param {{ force?: boolean, listIds?: string[] }} [options] force: re-read every added list
   */
  async function runCycle({ force = false } = {}) {
    if (!config || !isConfigured(config)) {
      return;
    }
    lastCycleAt = now();
    try {
      lists = await requireClient().getLists();
      await publishDiscovered();
      let changed = false;
      for (const listId of addedListIds()) {
        const entry = lists.find((list) => list.id === listId);
        if (!entry) {
          continue; // deleted in OurGroceries: the device stays, without updates
        }
        const cached = cache.get(listId);
        if (force || !cached || !entry.versionId || cached.versionId !== entry.versionId) {
          changed = (await fetchList(listId)) || changed;
        }
        await publishList(listId);
      }
      await succeeded();
      if (changed) {
        refreshWidget();
      }
    } catch (err) {
      await failed(err);
      throw err;
    }
  }

  /** Single flight: a second caller waits for the cycle in progress. */
  function cycle(options) {
    if (!cycleInFlight) {
      cycleInFlight = runCycle(options).finally(() => {
        cycleInFlight = null;
      });
    }
    return cycleInFlight;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped || !config) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      await api.tick().catch(() => {});
      schedule();
    }, refreshPeriodMs(config));
    timer.unref?.();
  }

  /** The list for a write: its id must be a list of the account. */
  function checkList(listId) {
    if (!listId || (lists && !lists.some((list) => list.id === listId))) {
      throw new Error(TEXT.unknownList[config.language]);
    }
  }

  /** After a write: read the list again, publish, nudge the widget. */
  async function afterWrite(listId) {
    await fetchList(listId);
    if (addedListIds().includes(listId)) {
      await publishList(listId);
    }
    refreshWidget();
  }

  const api = {
    /**
     * New configuration (or the first one): new client, everything read again.
     * @param {object} newConfig normalized config
     */
    async configure(newConfig) {
      const accountChanged =
        !config || config.email !== newConfig.email || config.password !== newConfig.password;
      const languageChanged = config && config.language !== newConfig.language;
      config = newConfig;
      stopped = false;
      // Called on every (re)connection too: Gladys may have restarted and
      // forgotten the status and the Discovery tab, say them again.
      lastConnectionStatus = null;
      publishedSignature = null;
      if (accountChanged) {
        client = isConfigured(config)
          ? createClient({
              email: config.email,
              password: config.password,
              session: createSessionStore({ email: config.email, dataDir }),
              fetch,
            })
          : null;
        lists = null;
        cache.clear();
        selfAdded.clear();
        publishedSignature = null;
        authBlocked = false;
        status = null;
      }
      if (!isConfigured(config)) {
        clearTimeout(timer);
        timer = null;
        status = 'not_configured';
        logger.info('Not configured yet: waiting for the OurGroceries email and password');
        await reportConnection(false, TEXT.notConfigured);
        return;
      }
      schedule();
      try {
        await cycle({ force: true });
        if (languageChanged) {
          // Text states follow the language (feature names stay as created).
          await publishDiscovered({ force: true });
          for (const listId of addedListIds()) {
            gladys.forgetPublishedStates?.(listIds(gladys, listId).device);
            await publishList(listId);
          }
          refreshWidget();
        }
      } catch {
        // Said by failed(): the timer retries, except on refused credentials.
      }
    },

    /** The timer's cycle: nothing while the credentials are refused. */
    async tick() {
      if (authBlocked) {
        logger.debug('Credentials refused: automatic refresh paused');
        return;
      }
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: refresh skipped');
        return;
      }
      if (lastCycleAt !== null && now() - lastCycleAt < refreshPeriodMs(config) * 0.5) {
        logger.debug('Refreshed less than half a period ago: skipped');
        return;
      }
      await cycle();
    },

    /**
     * The core's onPoll (fallback): a cycle only when the timer is late.
     * @param {{ external_id: string }} device
     */
    async pollFromCore(device) {
      if (!config || authBlocked || listIdOf(gladys, device.external_id) === null) {
        return;
      }
      if (lastCycleAt !== null && now() - lastCycleAt < refreshPeriodMs(config) * 0.9) {
        return;
      }
      await cycle().catch(() => {});
    },

    /**
     * A device was just added (or updated) in Gladys: Gladys dropped the
     * states published before it existed, send them all now.
     * @param {{ external_id: string }} device
     */
    async deviceCreated(device) {
      const listId = listIdOf(gladys, device.external_id);
      if (listId === null || !config || !isConfigured(config) || authBlocked) {
        return;
      }
      try {
        if (!cache.has(listId)) {
          await fetchList(listId);
        }
        gladys.forgetPublishedStates?.(device.external_id);
        await publishList(listId);
        refreshWidget();
      } catch (err) {
        await failed(err);
      }
    },

    /** The Discovery tab asks: read the lists again and publish them. */
    async scan() {
      authBlocked = false;
      await cycle({ force: true });
      await publishDiscovered({ force: true });
    },

    /**
     * "Test and refresh" (Configuration screen): sign in again whatever the
     * session, refresh everything, say what was found.
     */
    async testAndRefresh() {
      if (!isConfigured(config)) {
        throw new Error(TEXT.notConfigured[config.language]);
      }
      authBlocked = false;
      try {
        await requireClient().signIn();
      } catch (err) {
        await failed(err);
        throw new Error(
          isAuthError(err)
            ? TEXT.authFailed[config.language]
            : MESSAGES.unreachableStatus[config.language](err.message),
          { cause: err },
        );
      }
      await cycle({ force: true });
      await publishDiscovered({ force: true });
      return message(MESSAGES.connected, lists.length, addedListIds().length);
    },

    /**
     * The items of a list, read again when older than a period (widget).
     * @returns {Promise<{ name: string, items: object[] } | null>} null: no such list
     */
    async getList(listId) {
      const cached = cache.get(listId);
      if (!cached || now() - cached.fetchedAt > refreshPeriodMs(config)) {
        try {
          if (lists === null) {
            lists = await requireClient().getLists();
          }
          if (!lists.some((list) => list.id === listId)) {
            return null;
          }
          await fetchList(listId);
        } catch (err) {
          // OurGroceries does not answer: the last list read beats no list.
          if (!cached) {
            throw err;
          }
          logger.debug(`${listId}: showing the last list read (${err.message})`);
        }
      }
      const name = lists?.find((list) => list.id === listId)?.name ?? '';
      return { name, ...cache.get(listId) };
    },

    /**
     * Put an item on a list. Already there: nothing to do. Crossed off:
     * back on the list (what the app does), rather than a duplicate.
     * @returns {Promise<{ result: 'added' | 'restored' | 'already', name: string }>}
     */
    async addItem(listId, rawName) {
      const name = String(rawName ?? '').trim();
      if (name === '') {
        throw new Error(TEXT.emptyItem[config.language]);
      }
      checkList(listId);
      const og = requireClient();
      await fetchList(listId);
      const items = cache.get(listId).items;
      const active = findItemByName(items, name, { crossed: false });
      if (active) {
        return { result: 'already', name: active.name };
      }
      const crossed = findItemByName(items, name, { crossed: true });
      rememberSelfAdded(listId, crossed ? crossed.name : name);
      if (crossed) {
        await og.setCrossedOff(listId, crossed.id, false);
      } else {
        await og.addItem(listId, name);
      }
      await afterWrite(listId);
      return { result: crossed ? 'restored' : 'added', name: crossed ? crossed.name : name };
    },

    /**
     * Cross off an item, found by name (scene) or by id (widget).
     * @returns {Promise<{ found: boolean, name: string }>}
     */
    async crossOff(listId, { name, itemId } = {}) {
      checkList(listId);
      const og = requireClient();
      await fetchList(listId);
      const items = cache.get(listId).items;
      const item =
        itemId !== undefined
          ? items.find((entry) => entry.id === itemId && !entry.crossed)
          : findItemByName(items, String(name ?? ''), { crossed: false });
      if (!item) {
        return { found: false, name: String(name ?? '') };
      }
      await og.setCrossedOff(listId, item.id, true);
      await afterWrite(listId);
      return { found: true, name: item.name };
    },

    /**
     * Delete the crossed-off items of a list.
     * @returns {Promise<number>} how many were deleted
     */
    async clearCrossed(listId) {
      checkList(listId);
      const og = requireClient();
      await fetchList(listId);
      const crossed = crossedItems(cache.get(listId));
      if (crossed.length === 0) {
        return 0;
      }
      await og.deleteItems(
        listId,
        crossed.map((item) => item.id),
      );
      await afterWrite(listId);
      return crossed.length;
    },

    /** The list id of a device external id (or of a list id as is). */
    resolveListId(value) {
      return listIdOf(gladys, value);
    },

    get config() {
      return config;
    },

    /** Resolves once no refresh cycle is running (shutdown, tests). */
    async whenIdle() {
      while (cycleInFlight) {
        await cycleInFlight.catch(() => {});
      }
    },

    get status() {
      return status;
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
  return api;
}
