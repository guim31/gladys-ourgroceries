#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real OurGroceries web site, for a machine with Internet access
// (the development sessions of this repository have none).
//
//   node scripts/probe.mjs
//     Signs in with a made-up account and expects a refusal: checks that the
//     sign-in form, the cookie logic and the command endpoint still behave as
//     the client expects.
//
//   OG_EMAIL=… OG_PASSWORD=… node scripts/probe.mjs
//     Read-only run on a real account: signs in, reads the overview and the
//     items of the first list, and prints counts and field names only.
//
// Nothing sensitive is printed: no email, password, cookie, team id, list or
// item name. Exit code 0 when everything behaved as expected.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { BASE_URL, createClient } from '../src/ourgroceries/client.js';

const steps = [];

/** fetch, recording what each request got back (status, cookie set or not). */
async function tracingFetch(url, init = {}) {
  const response = await fetch(url, init);
  const cookies = response.headers.getSetCookie?.() ?? [];
  const command =
    init.body && init.headers?.['Content-Type'] === 'application/json'
      ? JSON.parse(init.body).command
      : undefined;
  const step = {
    request: `${init.method ?? 'GET'} ${new URL(url).pathname}`,
    command,
    status: response.status,
    location: response.headers.get('location') ?? undefined,
    content_type: response.headers.get('content-type')?.split(';')[0],
    session_cookie_set: cookies.some((line) => /^ourgroceries-auth=[^;\s]+/.test(line)),
  };
  // The field NAMES of the answers, to compare with the fixtures (no values).
  if (command && response.ok) {
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    step.fields = body ? Object.keys(body) : 'not JSON';
    const entries = body?.shoppingLists ?? body?.list?.items;
    if (Array.isArray(entries)) {
      step.entry_fields = [...new Set(entries.flatMap((entry) => Object.keys(entry)))].sort();
    }
  }
  steps.push(step);
  return response;
}

function printSteps() {
  for (const step of steps) {
    console.log('  ', JSON.stringify(step));
  }
  steps.length = 0;
}

async function probeRefusal() {
  console.log(`Probe 1: sign-in to ${BASE_URL} with a made-up account (a refusal is expected)`);
  const client = createClient({
    email: `gladys-probe-${randomBytes(4).toString('hex')}@example.invalid`,
    password: randomBytes(12).toString('base64url'),
    fetch: tracingFetch,
  });
  let ok = false;
  try {
    await client.signIn();
    console.log('   UNEXPECTED: the made-up account was accepted');
  } catch (err) {
    ok = err.code === 'auth';
    console.log(`   ${ok ? 'OK' : 'UNEXPECTED'}: ${err.code ?? 'error'} (${err.message})`);
  }
  printSteps();

  console.log('Probe 2: a command without a session (HTTP 400 is expected, as the site answered)');
  try {
    const response = await tracingFetch(`${BASE_URL}/your-lists/`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ command: 'getOverview' }),
    });
    await response.arrayBuffer().catch(() => {});
    // 400 is what the real site answered (probe of 2026-10-15). A redirect or a
    // 401/403 would also make the client sign in again: fine, but worth noting.
    if (response.status === 400) {
      console.log('   OK: HTTP 400, the client treats it as an ended session');
    } else if (
      (response.status >= 300 && response.status < 400) ||
      [401, 403].includes(response.status)
    ) {
      console.log(
        `   OK (changed): HTTP ${response.status}, still an ended session for the client`,
      );
    } else {
      console.log(`   UNEXPECTED: HTTP ${response.status}, the client would not sign in again`);
      ok = false;
    }
  } catch (err) {
    console.log(`   UNREACHABLE: ${err.cause?.code ?? err.message}`);
    ok = false;
  }
  printSteps();
  return ok;
}

async function probeAccount(email, password) {
  console.log('Probe 3: read-only run on the account given in OG_EMAIL / OG_PASSWORD');
  const client = createClient({ email, password, fetch: tracingFetch });
  try {
    const lists = await client.getLists();
    console.log(
      `   OK: ${lists.length} shopping list(s), versionId present: ${lists.every((l) => l.versionId !== '')}`,
    );
    if (lists.length > 0) {
      const list = await client.getList(lists[0].id);
      const crossed = list.items.filter((item) => item.crossed).length;
      console.log(`   OK: first list: ${list.items.length} item(s), ${crossed} crossed off`);
    }
    printSteps();
    return true;
  } catch (err) {
    console.log(`   FAILED: ${err.code ?? 'error'} (${err.message})`);
    printSteps();
    return false;
  }
}

let success = await probeRefusal();
if (process.env.OG_EMAIL && process.env.OG_PASSWORD) {
  success = (await probeAccount(process.env.OG_EMAIL, process.env.OG_PASSWORD)) && success;
}
process.exit(success ? 0 : 1);
