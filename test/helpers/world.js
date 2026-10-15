// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake OurGroceries site, a
// temporary /data, and the integration wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { EMAIL, PASSWORD, createFakeOurGroceries } from './fakeOurGroceries.js';

// Keep the test output readable (LOG_LEVEL is read on every log call);
// LOG_LEVEL=debug npm test shows the logs.
process.env.LOG_LEVEL ??= 'silent';

export const CONFIG = { email: EMAIL, password: PASSWORD };

/** The hubs of the worlds built by this test file. */
const hubs = new Set();

/**
 * Let a fired timer run to its end: the cycle it started (sign-in, session
 * written under /data, reads, states) is awaited, not counted in event-loop
 * turns, which vary with the disk.
 */
export async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await Promise.all([...hubs].map((hub) => hub.whenIdle()));
  }
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {string[]} [options.addedLists] OurGroceries list ids already added to Gladys
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers]
 * @param {object} [options.site] an existing fake OurGroceries
 */
export async function createWorld({
  config = CONFIG,
  addedLists = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-ourgroceries-')),
  now,
  timers = false,
  site = createFakeOurGroceries(),
} = {}) {
  const gladys = createFakeGladys({ config });
  gladys.fake.devices = addedLists.map((listId) => deviceOf(gladys, listId));
  const app = registerHandlers(gladys, { dataDir, fetch: site.fetch, timers, now });
  hubs.add(app.hub);
  if (connect) {
    await gladys.connect();
  }
  return { gladys, app, hub: app.hub, site, dataDir };
}

/** The device Gladys stores once the user added a list. */
export function deviceOf(gladys, listId) {
  const external = gladys.externalIds('list', listId);
  return {
    name: listId,
    external_id: external.device,
    features: ['remaining', 'crossed_off', 'items'].map((key) => ({
      external_id: external.feature(key),
    })),
  };
}

/** The last value Gladys received for one feature of a list. */
export const stateOf = (gladys, listId, key) =>
  gladys.fake.lastState(gladys.externalIds('list', listId).feature(key));
