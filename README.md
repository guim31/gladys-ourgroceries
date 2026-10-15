# OurGroceries for Gladys Assistant

An external integration that brings your shared
[OurGroceries](https://www.ourgroceries.com) shopping lists into
[Gladys Assistant](https://gladysassistant.com).

> **Developed without an OurGroceries account to test against: feedback
> welcome.** The requests follow the `ourgroceries` Python library used by
> the Home Assistant integration; the code is tested against a fake
> OurGroceries site built from their shapes, not against the real service.
>
> This integration is not affiliated with, endorsed by or supported by
> OurGroceries.

## What it does

- **One device per shopping list** you add from the Discover tab: the number
  of items to buy, the number of crossed-off items, and the list itself as a
  text (for a notification or a scene).
- **A dashboard widget** (Gladys 5.2+): the items to buy, with buttons that
  open a form to **add** an item, **cross off** one (picked in a list: Gladys
  widgets have no checkbox) and **clear** the crossed-off items.
- **A scene trigger**, "Item added to a shopping list", with the item and the
  list name as scene information. Items added by Gladys itself do not fire
  it, so a scene cannot loop.
- **Three scene actions**: "Add to a shopping list" (no duplicate: an item
  already there is left alone, a crossed-off one comes back), "Cross off an
  item" (by name, ignoring case, accents and a quantity in parentheses) and
  "Clear the crossed-off items". Perfect behind a button: "out of milk".
- **Gentle refresh**: one request every 5 minutes (configurable from 2 to 30)
  reads the overview of the account; a list's items are read again only when
  its version changed, and only for the lists added to Gladys. Writes and the
  "Test the connection and refresh" button act at once.

## Requirements

- Gladys Assistant **5.2.0** or later (widget buttons that open a form).
- An OurGroceries account with an **email and a password** (an account
  opened with Google or Apple sign-in needs a password set on the web site).
- Internet access from Gladys: `transports` is `cloud`.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `guim31/gladys-ourgroceries` (or install it from the store once listed).
2. In the **Configuration** tab, enter the email and password of the
   OurGroceries account, then save. Press **Test the connection and
   refresh** to check.
3. Open the **Discover** tab and add the shopping lists you want.
4. Add the **Shopping list** widget to a dashboard, and use the scene cards
   under the **Integrations** category of the scene editor.

The user documentation, in English, French, German and Spanish, is in
[`docs/`](docs/en.md); Gladys shows it from the Configuration screen.

## Limitations

- OurGroceries has no public API: if the web site changes, the integration
  may stop working until it is updated.
- Changes made in the app reach Gladys at the next refresh, not instantly.
- Categories, notes, quantities, recipes and the master list are not
  handled.
- After refused credentials, the integration does not retry by itself (a
  wrong password retried every few minutes can lock an account): fix the
  configuration or press the test button.

## Development

Node.js 22 or later, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store . --skip-image-check
```

The tests run the integration against the SDK's fake Gladys and a fake
OurGroceries site (`test/helpers/fakeOurGroceries.js`), from the fixtures of
`test/fixtures/ourgroceries/`; they never touch the network.

`scripts/probe.mjs` exercises the real client from a machine with Internet
access, without printing anything sensitive:

```bash
node scripts/probe.mjs                  # a made-up account: expects a refusal
OG_EMAIL=… OG_PASSWORD=… node scripts/probe.mjs   # read-only: counts only
```

Architecture: `index.js` (SDK wiring) → `src/app.js` (handlers) →
`src/hub.js` (refresh timer, states, trigger, writes) →
`src/ourgroceries/` (client, parsing). See [`CLAUDE.md`](CLAUDE.md).

Releases come from **Actions → Release** (version, changelog, tag, image,
GitHub Release). Prefer the terminal? A hand-pushed `vX.Y.Z` tag triggers the
same build, but bump `version` in `package.json` and in the manifest (with the
`docker_image` tag) and commit it **before** tagging.

## Credits

- [`ljmerza/py-our-groceries`](https://github.com/ljmerza/py-our-groceries)
  (MIT), by Leonardo Merza and contributors: the sign-in and the commands of
  the OurGroceries web site.
- The Home Assistant
  [`ourgroceries` integration](https://www.home-assistant.io/integrations/ourgroceries/)
  (Apache-2.0) and its tests: the shapes of the lists and items, and the
  version check that keeps the refresh light.
- [`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js),
  the starting point of this repository.

## License

Apache-2.0, see [`LICENSE`](LICENSE). OurGroceries is a trademark of its
owner.
