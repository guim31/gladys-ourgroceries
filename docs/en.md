# OurGroceries

Your shared [OurGroceries](https://www.ourgroceries.com) shopping lists in
Gladys: the items still to buy on each list, a dashboard widget to add and
cross off items, and scene cards to put "milk" on the list at the press of a
button.

This integration is not affiliated with OurGroceries. **It was developed
without an OurGroceries account to test against: feedback welcome**, on the
Gladys forum or in the GitHub issues.

## What it does

- One Gladys device per shopping list you choose, with the number of items
  to buy, the number of crossed-off items and the list itself as a text.
- A **Shopping list** widget for the dashboard: the items to buy, with
  buttons to add, cross off and clear.
- A scene trigger, **Item added to a shopping list**, and three scene
  actions: **Add to a shopping list**, **Cross off an item** and **Clear the
  crossed-off items**.
- Changes made in the OurGroceries app show up in Gladys at the next refresh
  (every 5 minutes by default).

## Requirements

- Gladys 5.2.0 or later.
- An OurGroceries account signed in with an **email and a password**. An
  account opened with "Sign in with Google" or "Sign in with Apple" has no
  password: set one on the OurGroceries web site first.
- Internet access from Gladys: the integration talks to the OurGroceries
  servers.

## Configuration

1. In Gladys, open **Integrations**, then **Install from GitHub**, and
   install `guim31/gladys-ourgroceries` (or install it from the store).
2. In the **Configuration** tab, enter your OurGroceries **email** and
   **password**, then save.
3. Optionally, pick how often the lists are read (**Refresh every**, 5
   minutes by default) and the **Language of the texts** (French by
   default): it names the features when a list is added, and writes the
   list text and the messages.
4. Press **Test the connection and refresh**: the message under the button
   tells how many shopping lists the account has.
5. Open the **Discover** tab: each shopping list of the account is there.
   Add the ones you want in Gladys. Recipes are not shopping lists and are
   left out.

## Devices

Each shopping list you add becomes a device named after the list, with
three read-only features:

| Feature           | What it holds                                                               |
| ----------------- | --------------------------------------------------------------------------- |
| Items to buy      | How many items are not crossed off                                          |
| Crossed-off items | How many items are crossed off and still on the list                        |
| List              | The names of the items to buy, separated by commas (255 characters at most) |

Renaming a list in OurGroceries keeps its device: Gladys knows the list by
its OurGroceries identifier, not by its name. A list created later in the
app appears in the **Discover** tab at the next refresh.

## Dashboard widget

Add the **Shopping list** widget to a dashboard and choose the list in its
settings. It shows the name of the list, the number of items to buy (live),
the first 8 items and how many more there are, and three buttons:

- **Add** opens a field to type an item;
- **Cross off** opens the list of the items to buy: pick one;
- **Clear crossed** deletes the crossed-off items, after a confirmation.

Gladys widgets have no checkbox: crossing off goes through the list of the
**Cross off** button. Adding an item already on the list changes nothing;
adding a crossed-off item puts it back on the list, like the app does.

## Scene trigger

**Item added to a shopping list** starts a scene when someone adds an item
in OurGroceries. Choose a list, or leave it empty for every list. The scene
can use the **Item** and the **List name** in its messages.

The trigger fires at the refresh following the addition (up to 5 minutes
later by default). Items added by Gladys itself (a scene, the widget) do not
fire it, so a scene cannot loop on itself. An item crossed off then restored
counts as added.

## Scene actions

- **Add to a shopping list**: puts an item on the chosen list. Already
  there: nothing changes. Crossed off: back on the list. Returns **Item
  added** (no when it was already there) and **Item as on the list**.
- **Cross off an item**: crosses off the item with this name. Case, accents
  and a quantity in parentheses do not count: "lait" crosses off "Lait (2)".
  Returns **Item found and crossed off**.
- **Clear the crossed-off items**: deletes the crossed-off items of the
  list. Returns **Items deleted**.

The text fields accept scene information, such as the item of the trigger.

## Scene examples

- **"Out of milk" button**: trigger "a button is pressed" (a Zigbee
  button on the fridge), action **Add to a shopping list** with the item
  "Milk".
- **Tell me what was added**: trigger **Item added to a shopping list**,
  action "send a message" with the **Item** and the **List name**.
- **Back from shopping**: trigger "the user arrives home", condition
  **Crossed-off items** above 0, action **Clear the crossed-off items**.

## Refresh and service limits

OurGroceries publishes no API and no quota. Like the Home Assistant
integration, this integration uses the requests of the official web site,
and stays gentle with them:

- one request per refresh reads the overview of the account; the items of a
  list are read again only when the list changed;
- only the lists added to Gladys are read;
- the refresh period is 5 minutes by default (2 minutes at most, 30 at
  least); a button press, the widget and the scene actions read and write
  at once;
- after refused credentials, nothing is retried until you change the
  configuration or press **Test the connection and refresh**: retrying a
  wrong password can lock an account.

Use it within the [terms of OurGroceries](https://www.ourgroceries.com/terms).

## Data and privacy

The password is stored by Gladys, like every secret field. The integration
keeps only the session cookie of OurGroceries and the team identifier in
its own volume (`/data/session.json`), so a restart does not sign in again.
Neither the password, nor the email, nor the cookie is ever written to the
logs.

## Troubleshooting

- **"OurGroceries refused the email or the password"**: check them on the
  OurGroceries web site, then save the configuration again.
- **"OurGroceries is unreachable"**: the integration retries at every
  refresh and says in the logs when the service answers again.
- **A change made in the app is not in Gladys yet**: wait for the next
  refresh, or press **Test the connection and refresh**.
- **The integration logs**: open the integration in Gladys, then its logs.
  For every request, set the `LOG_LEVEL` variable of the container to
  `debug`.

## Limitations

- Developed without an OurGroceries account: the requests follow the
  `ourgroceries` Python library used by Home Assistant. If OurGroceries
  changes its web site, the integration may stop working until it is
  updated.
- Changes reach Gladys at the next refresh, not instantly.
- Categories, notes, quantities, recipes and the master list are not
  handled. An item is added without a category: OurGroceries files it as in
  the app.
- The **Cross off** button of the widget lists the first 50 items to buy.
- Feature names are set in the language of the configuration when a list
  is added; changing the language later renames nothing.
