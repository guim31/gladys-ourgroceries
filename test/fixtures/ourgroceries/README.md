# OurGroceries fixtures

OurGroceries publishes no API documentation. These answers follow the shapes
read and written by:

- [`ljmerza/py-our-groceries`](https://github.com/ljmerza/py-our-groceries)
  (MIT): the sign-in form, the `ourgroceries-auth` cookie, the `g_teamId`
  line of the lists page, the commands `getOverview`, `getList`,
  `insertItem`, `setItemCrossedOff` and `edit`;
- the Home Assistant `ourgroceries` integration and its tests (Apache-2.0):
  `shoppingLists[].{id, name, versionId}`, `list.{versionId, items}`,
  `items[].{id, name, crossedOffAt, categoryId}`.

Every id, name and value here is invented: no real account was read.
`lists-page.html` keeps only the lines the integration reads.
