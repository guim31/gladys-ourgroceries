// -----------------------------------------------------------------------------
// The OurGroceries client against the fake site: sign-in, session kept and
// renewed, errors sorted into auth / network / protocol.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, memorySessionStore, readCookie } from '../src/ourgroceries/client.js';
import { OurGroceriesError } from '../src/ourgroceries/errors.js';
import {
  EMAIL,
  LIST_COURSES,
  PASSWORD,
  TEAM_ID,
  createFakeOurGroceries,
} from './helpers/fakeOurGroceries.js';

const clientFor = (site, overrides = {}) =>
  createClient({ email: EMAIL, password: PASSWORD, fetch: site.fetch, ...overrides });

test('signs in, reads the team id, then lists the shopping lists (recipes left out)', async () => {
  const site = createFakeOurGroceries();
  const session = memorySessionStore();
  const lists = await clientFor(site, { session }).getLists();
  assert.deepEqual(
    lists.map((list) => list.name),
    ['Courses', 'Bricolage'],
  );
  assert.deepEqual(
    site.requests.map((r) => `${r.method} ${r.path}`),
    ['POST /sign-in', 'GET /your-lists/', 'POST /your-lists/'],
  );
  const stored = await session.load();
  assert.equal(stored.teamId, TEAM_ID);
  assert.match(stored.cookie, /^session-/);
  assert.equal(JSON.stringify(stored).includes(PASSWORD), false);
});

test('a stored session is used as is: no new sign-in after a restart', async () => {
  const site = createFakeOurGroceries();
  const session = memorySessionStore();
  await clientFor(site, { session }).getLists();
  await clientFor(site, { session }).getLists();
  assert.equal(site.signIns, 1);
});

test('an ended session is renewed once, and the command retried', async () => {
  const site = createFakeOurGroceries();
  const client = clientFor(site);
  await client.getLists();
  site.expireSessions();
  const list = await client.getList(LIST_COURSES);
  assert.equal(list.items.length, 5);
  assert.equal(site.signIns, 2);
});

test('refused credentials are an auth error, without the password in the message', async () => {
  const site = createFakeOurGroceries();
  const client = clientFor(site, { password: 'wrong password' });
  await assert.rejects(client.getLists(), (err) => {
    assert.ok(err instanceof OurGroceriesError);
    assert.equal(err.code, 'auth');
    assert.equal(err.message.includes('wrong password'), false);
    assert.equal(err.message.includes(EMAIL), false);
    return true;
  });
  assert.deepEqual(site.commands(), []);
});

test('no answer is a network error, a server error too', async () => {
  const site = createFakeOurGroceries();
  site.failure = 'network';
  await assert.rejects(clientFor(site).getLists(), { code: 'network' });
  site.failure = 503;
  await assert.rejects(clientFor(site).getLists(), { code: 'network' });
});

test('an answer the client does not understand is a protocol error', async () => {
  const site = createFakeOurGroceries();
  const original = site.handle;
  site.handle = (body) => (body.command === 'getOverview' ? { lists: 'nope' } : original(body));
  await assert.rejects(clientFor(site).getLists(), { code: 'protocol' });
});

test('writes send the commands of the site, with the team id', async () => {
  const site = createFakeOurGroceries();
  const client = clientFor(site);
  await client.addItem(LIST_COURSES, 'Beurre');
  await client.setCrossedOff(LIST_COURSES, 'it-0002', true);
  await client.deleteItems(LIST_COURSES, ['it-0004']);
  const writes = site.requests.filter((r) => r.command);
  assert.deepEqual(
    writes.map((r) => r.command),
    ['insertItem', 'setItemCrossedOff', 'edit'],
  );
  assert.ok(writes.every((r) => r.body.teamId === TEAM_ID));
  assert.deepEqual(writes[2].body.edits, [{ editType: 'delete', itemId: 'it-0004' }]);
  const names = site.items(LIST_COURSES).map((item) => item.name);
  assert.ok(names.includes('Beurre') && !names.includes('Café'));
});

test('the team id is read whatever the quotes of the page', async () => {
  const site = createFakeOurGroceries();
  const original = site.fetch;
  site.fetch = async (url, init) => {
    const response = await original(url, init);
    if (init?.method === 'GET' && response.status === 200) {
      const page = (await response.text()).replaceAll('"', "'");
      return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return response;
  };
  await clientFor(site).getLists();
});

test('concurrent commands share one sign-in', async () => {
  const site = createFakeOurGroceries();
  const client = clientFor(site);
  await Promise.all([client.getLists(), client.getList(LIST_COURSES), client.getLists()]);
  assert.equal(site.signIns, 1);
});

test('readCookie ignores an emptied or expired cookie', () => {
  const headers = (...lines) => {
    const h = new Headers();
    for (const line of lines) h.append('set-cookie', line);
    return h;
  };
  assert.equal(readCookie(headers('ourgroceries-auth=abc; Path=/'), 'ourgroceries-auth'), 'abc');
  assert.equal(readCookie(headers('ourgroceries-auth=; Path=/'), 'ourgroceries-auth'), null);
  assert.equal(readCookie(headers('ourgroceries-auth=x; Max-Age=0'), 'ourgroceries-auth'), null);
  assert.equal(readCookie(headers('other=1', 'ourgroceries-auth=z'), 'ourgroceries-auth'), 'z');
  assert.equal(readCookie(headers(), 'ourgroceries-auth'), null);
});
