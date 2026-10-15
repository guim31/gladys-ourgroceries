// -----------------------------------------------------------------------------
// The "Test the connection and refresh" button of the Configuration screen.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_COURSES } from './helpers/fakeOurGroceries.js';
import { CONFIG, createWorld } from './helpers/world.js';

test('signs in again, refreshes, and says what it found', async () => {
  const { gladys, site } = await createWorld({ addedLists: [LIST_COURSES] });
  const ack = await gladys.fake.action('test_and_refresh', {});
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.message ?? ack.data, {
    en: 'Connected: 2 shopping list(s) in the account, 1 added to Gladys.',
    fr: 'Connecté : 2 liste(s) de courses sur le compte, 1 ajoutée(s) à Gladys.',
    de: 'Verbunden: 2 Einkaufsliste(n) im Konto, 1 zu Gladys hinzugefügt.',
    es: 'Conectado: 2 lista(s) de la compra en la cuenta, 1 añadida(s) a Gladys.',
  });
  assert.equal(site.signIns, 2, 'a fresh sign-in, whatever the stored session');
});

test('refused credentials: the button says so in the configured language', async () => {
  const { gladys } = await createWorld({ config: { ...CONFIG, password: 'nope', language: 'es' } });
  const ack = await gladys.fake.action('test_and_refresh', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /ha rechazado el correo o la contraseña/);
});

test('the button resumes the refresh paused by refused credentials', async () => {
  const { gladys, site } = await createWorld({ config: { ...CONFIG, password: 'nope' } });
  site.password = 'nope'; // the user fixed the password on the OurGroceries side
  const ack = await gladys.fake.action('test_and_refresh', {});
  assert.equal(ack.success, true);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('not configured: the button says what to fill in', async () => {
  const { gladys } = await createWorld({ config: {} });
  const ack = await gladys.fake.action('test_and_refresh', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /e-mail et le mot de passe/);
});
