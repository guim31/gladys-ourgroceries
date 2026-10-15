# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Sign-in to an OurGroceries account with its email and password; the session
  is kept in the integration's volume, so a restart does not sign in again.
- One device per shopping list added from the Discover tab: items to buy,
  crossed-off items, and the list itself as a text.
- Refresh every 5 minutes by default (2 to 30), on the integration's own
  timer: one request reads the overview of the account, a list is read again
  only when it changed. A list just added to Gladys gets its values at once.
- "Shopping list" dashboard widget (Gladys 5.2.0 or later): the items to buy,
  with buttons to add an item, cross one off and clear the crossed-off items.
- Scene trigger "Item added to a shopping list", with the item and the list
  name. Items added by Gladys itself do not fire it.
- Scene actions "Add to a shopping list" (no duplicate, a crossed-off item
  comes back), "Cross off an item" (by name, ignoring case and accents) and
  "Clear the crossed-off items".
- "Test the connection and refresh" button in the Configuration screen.
- Texts, feature names and documentation in English, French, German and
  Spanish (French by default).

[Unreleased]: https://github.com/guim31/gladys-ourgroceries/commits/main
