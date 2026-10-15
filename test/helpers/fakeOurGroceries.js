// -----------------------------------------------------------------------------
// A fake OurGroceries web site behind a `fetch` function: the sign-in form,
// the lists page and the JSON commands, seeded from the fixtures and changing
// like the real service (a write bumps the list version). No network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) => new URL(`../fixtures/ourgroceries/${name}`, import.meta.url);
const json = (name) => JSON.parse(readFileSync(fixture(name), 'utf8'));

export const EMAIL = 'family@example.com';
export const PASSWORD = 'correct horse battery staple';
export const LIST_COURSES = 'Xk3pQ9rT2vLmN8wYz4aB1c';
export const LIST_BRICOLAGE = 'Rf6tG1hJ8kZq0pLs5nVb2m';
export const TEAM_ID = 'Tm4nV8bC2xZ6qW1eR9tY3u';
const LISTS_PAGE = readFileSync(fixture('lists-page.html'), 'utf8');

const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });
const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

export function createFakeOurGroceries() {
  const overview = json('overview.json');
  const lists = new Map();
  for (const name of ['list-courses.json', 'list-bricolage.json']) {
    const { list } = json(name);
    lists.set(list.id, structuredClone(list));
  }
  let version = 0;
  let nextItem = 100;
  let nextCookie = 1;
  const cookies = new Set();

  const fake = {
    email: EMAIL,
    password: PASSWORD,
    lists,
    /** Every request: `{ method, path, command? }`. */
    requests: [],
    /** What a command without a valid session gets: 400, like the real site (probe.mjs). */
    endedSessionStatus: 400,
    /** 'network' (fetch throws), a status code (answered), or null. */
    failure: null,
    signIns: 0,

    commands: () => fake.requests.filter((r) => r.command).map((r) => r.command),
    /** End every session (the site logged everyone out). */
    expireSessions() {
      cookies.clear();
    },
    /** Change a list like someone using the app. */
    edit(listId, change) {
      const list = lists.get(listId);
      change(list);
      list.versionId = `v${++version}`;
    },
    addFromApp(listId, name) {
      fake.edit(listId, (list) => list.items.push({ id: `it-${++nextItem}`, name, value: name }));
    },
    items: (listId) => lists.get(listId).items,

    async fetch(url, init = {}) {
      const { pathname } = new URL(url);
      const method = init.method ?? 'GET';
      const record = { method, path: pathname };
      fake.requests.push(record);
      if (fake.failure === 'network') {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      if (typeof fake.failure === 'number') {
        return html('error', fake.failure);
      }
      const cookie = /ourgroceries-auth=([^;]+)/.exec(init.headers?.Cookie ?? '')?.[1];
      const signedIn = cookie !== undefined && cookies.has(cookie);

      if (pathname === '/sign-in' && method === 'POST') {
        const form = new URLSearchParams(init.body);
        if (
          form.get('action') !== 'sign-in' ||
          form.get('emailAddress') !== fake.email ||
          form.get('password') !== fake.password
        ) {
          return html('<form action="/sign-in">Invalid email or password</form>');
        }
        fake.signIns += 1;
        const value = `session-${nextCookie++}`;
        cookies.add(value);
        return redirect('/your-lists/', {
          'set-cookie': `ourgroceries-auth=${value}; Path=/; HttpOnly; Secure`,
        });
      }

      if (pathname === '/your-lists/' && method === 'GET') {
        return signedIn ? html(LISTS_PAGE) : redirect('/sign-in');
      }

      if (pathname === '/your-lists/' && method === 'POST') {
        if (!signedIn) {
          return fake.endedSessionStatus === 302
            ? redirect('/sign-in')
            : new Response('', { status: fake.endedSessionStatus });
        }
        const body = JSON.parse(init.body);
        record.command = body.command;
        record.body = body;
        if (body.teamId !== TEAM_ID) {
          return new Response('{"error":"team"}', { status: 400 });
        }
        return Response.json(fake.handle(body));
      }
      return html('not found', 404);
    },

    handle(body) {
      const list = lists.get(body.listId);
      switch (body.command) {
        case 'getOverview':
          return {
            ...overview,
            shoppingLists: [...lists.values()].map(({ id, name, versionId }) => ({
              id,
              name,
              versionId,
            })),
          };
        case 'getList':
          return { command: 'getList', list: structuredClone(list) };
        case 'insertItem':
          fake.edit(body.listId, (l) =>
            l.items.push({ id: `it-${++nextItem}`, name: body.value, value: body.value }),
          );
          return { command: 'insertItem', itemId: `it-${nextItem}` };
        case 'setItemCrossedOff':
          fake.edit(body.listId, (l) => {
            const item = l.items.find((i) => i.id === body.itemId);
            if (body.crossedOff) {
              item.crossedOffAt = 1760000000;
            } else {
              delete item.crossedOffAt;
            }
          });
          return { command: 'setItemCrossedOff' };
        case 'edit':
          fake.edit(body.listId, (l) => {
            const deleted = new Set(
              body.edits.filter((e) => e.editType === 'delete').map((e) => e.itemId),
            );
            l.items = l.items.filter((i) => !deleted.has(i.id));
          });
          return { command: 'edit' };
        default:
          return { error: `unknown command ${body.command}` };
      }
    },
  };
  fake.fetch = fake.fetch.bind(fake);
  return fake;
}
