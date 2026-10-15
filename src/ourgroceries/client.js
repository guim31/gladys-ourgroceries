// -----------------------------------------------------------------------------
// OurGroceries client.
//
// OurGroceries has no public API: like the `ourgroceries` Python library used
// by Home Assistant, this client speaks to the endpoints of the official web
// site.
//   1. Sign-in: a form POST to /sign-in; success sets the `ourgroceries-auth`
//      session cookie (no cookie: the credentials were refused).
//   2. The team id: read from the /your-lists/ page (`g_teamId = "…";`).
//   3. Every command: a JSON POST to /your-lists/ with the cookie,
//      `{ command, teamId, ...payload }`, answered in JSON.
// The cookie and the team id are kept in the session store (/data), so a
// restart does not sign in again. A command answered by a redirect, a 401/403
// or an HTML page means the session ended: the client signs in once more and
// retries, once.
// -----------------------------------------------------------------------------

import { OurGroceriesError } from './errors.js';
import { parseList, parseOverview } from './model.js';

export const BASE_URL = 'https://www.ourgroceries.com';
const SIGN_IN_URL = `${BASE_URL}/sign-in`;
const LISTS_URL = `${BASE_URL}/your-lists/`;
const COOKIE_NAME = 'ourgroceries-auth';
const TEAM_ID_PATTERN = /g_teamId\s*=\s*["']([^"']+)["']/;
const USER_AGENT = 'gladys-ourgroceries (+https://github.com/guim31/gladys-ourgroceries)';
const DEFAULT_TIMEOUT_MS = 15000;

/** A session store that keeps nothing (tests, probe). */
export const memorySessionStore = () => {
  let session = null;
  return {
    load: async () => session,
    save: async (value) => {
      session = value;
    },
    clear: async () => {
      session = null;
    },
  };
};

/**
 * @param {object} options
 * @param {string} options.email
 * @param {string} options.password
 * @param {{ load(): Promise<object|null>, save(s: object): Promise<void>, clear(): Promise<void> }} [options.session]
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 */
export function createClient({
  email,
  password,
  session = memorySessionStore(),
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  /** { cookie, teamId } in use, loaded from the store on first need. */
  let current = null;
  let loaded = false;
  /** A sign-in in progress: concurrent commands wait for the same one. */
  let signingIn = null;

  async function request(url, init) {
    try {
      return await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new OurGroceriesError('network', `OurGroceries unreachable (${reason})`, {
        cause: err,
      });
    }
  }

  async function signIn() {
    const body = new URLSearchParams({ emailAddress: email, password, action: 'sign-in' });
    const response = await request(SIGN_IN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (response.status >= 500) {
      throw new OurGroceriesError('network', `sign-in answered HTTP ${response.status}`);
    }
    const cookie = readCookie(response.headers, COOKIE_NAME);
    // Drain the body: an unread one keeps the connection busy.
    await response.arrayBuffer().catch(() => {});
    if (!cookie) {
      throw new OurGroceriesError('auth', 'OurGroceries refused the email or the password');
    }

    const page = await request(LISTS_URL, {
      method: 'GET',
      headers: { Cookie: cookieHeader(cookie) },
    });
    if (isRedirect(page.status) || page.status === 401 || page.status === 403) {
      await page.arrayBuffer().catch(() => {});
      throw new OurGroceriesError('auth', 'OurGroceries refused the new session');
    }
    if (!page.ok) {
      throw new OurGroceriesError('network', `lists page answered HTTP ${page.status}`);
    }
    const teamId = (await page.text()).match(TEAM_ID_PATTERN)?.[1];
    if (!teamId) {
      throw new OurGroceriesError('protocol', 'team id not found on the lists page');
    }
    current = { cookie, teamId };
    await session.save({ cookie, teamId });
    return current;
  }

  /** The session in use: the stored one, else a new sign-in. */
  async function ensureSession({ renew = false } = {}) {
    if (!loaded) {
      loaded = true;
      const stored = await session.load().catch(() => null);
      if (stored && typeof stored.cookie === 'string' && typeof stored.teamId === 'string') {
        current = { cookie: stored.cookie, teamId: stored.teamId };
      }
    }
    if (current && !renew) {
      return current;
    }
    if (!signingIn) {
      signingIn = (async () => {
        try {
          if (renew) {
            current = null;
            await session.clear().catch(() => {});
          }
          return await signIn();
        } finally {
          signingIn = null;
        }
      })();
    }
    return signingIn;
  }

  /**
   * One command, with one renewed session on an ended one.
   * @param {string} command
   * @param {object} [payload]
   */
  async function command(command, payload = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { cookie, teamId } = await ensureSession({ renew: attempt > 0 });
      const response = await request(LISTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: cookieHeader(cookie),
        },
        body: JSON.stringify({ command, teamId, ...payload }),
      });
      if (isRedirect(response.status) || response.status === 401 || response.status === 403) {
        await response.arrayBuffer().catch(() => {});
        continue; // session ended: sign in again
      }
      if (!response.ok) {
        await response.arrayBuffer().catch(() => {});
        throw new OurGroceriesError('network', `${command} answered HTTP ${response.status}`);
      }
      const text = await response.text();
      if (text.trim() === '') {
        return {};
      }
      try {
        return JSON.parse(text);
      } catch {
        if (/^\s*</.test(text)) {
          continue; // an HTML page (the sign-in form): session ended
        }
        throw new OurGroceriesError('protocol', `${command} answered something else than JSON`);
      }
    }
    throw new OurGroceriesError('auth', 'OurGroceries ended the session and refused a new one');
  }

  return {
    /** Sign in now, whatever the stored session (Test the connection). */
    async signIn() {
      loaded = true;
      await ensureSession({ renew: true });
    },

    /** The shopping lists of the account (id, name, versionId). */
    async getLists() {
      return parseOverview(await command('getOverview'));
    },

    /** The items of one list. */
    async getList(listId) {
      return parseList(await command('getList', { listId }));
    },

    /** Add an item; OurGroceries picks its category, like in the app. */
    async addItem(listId, value) {
      return command('insertItem', { listId, value });
    },

    /** Cross off (or restore) an item. */
    async setCrossedOff(listId, itemId, crossedOff) {
      return command('setItemCrossedOff', { listId, itemId, crossedOff });
    },

    /** Delete items in one request (the "edit" command the site sends). */
    async deleteItems(listId, itemIds) {
      return command('edit', {
        listId,
        edits: itemIds.map((itemId) => ({ editType: 'delete', itemId })),
      });
    },
  };
}

/** Value of a cookie set by the response, or null. */
export function readCookie(headers, name) {
  const lines =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  for (const line of lines) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0 && pair.slice(0, index).trim() === name) {
      const value = pair.slice(index + 1).trim();
      // An emptied cookie (logout, refusal) is no session.
      if (value !== '' && value !== '""' && !/max-age=0\b/i.test(line)) {
        return value;
      }
    }
  }
  return null;
}

const cookieHeader = (cookie) => `${COOKIE_NAME}=${cookie}`;
const isRedirect = (status) => status >= 300 && status < 400;
