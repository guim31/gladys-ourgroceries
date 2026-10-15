// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the texts of the code and
// the documentation. German says "du", never the polite "Sie"; Spanish says
// "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { FEATURE_NAMES, MESSAGES, TEXT } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;
// Informal Spanish ("tú") where "usted" was decided: the unambiguous markers
// only (an imperative like "abre" is also the third person, "it opens").
const INFORMAL_SPANISH = /(?<!\p{L})(tú|tu|tus|ti|contigo|puedes|quieres|tienes|debes)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && INFORMAL_SPANISH.test(text)) {
    found.push(`${path} uses "tú" instead of "usted": "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : /^manifest\.config_schema\[\d+\]\.description$/.test(path)
              ? 1000 // a section intro (SECTION_DESCRIPTION_MAX_LENGTH of the core)
              : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(FEATURE_NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 45, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('the catalog description holds 10 characters at least in every language', () => {
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('every text of the code has the four languages', () => {
  const shortKeys = new Set(['toBuy', 'add', 'crossOff', 'clearCrossed', 'itemField']);
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(value, `TEXT.${key}`, shortKeys.has(key) ? MAX.short : MAX.message),
  );
  assert.deepEqual(found, []);
});

test('every message with parameters has the four languages', () => {
  const samples = {
    unreachableStatus: ['timeout'],
    connected: [3, 2],
    more: [4],
    added: ['Lait'],
    restored: ['Lait'],
    alreadyThere: ['Lait'],
    crossedOff: ['Lait'],
    cleared: [2],
  };
  assert.deepEqual(sorted(Object.keys(MESSAGES)), sorted(Object.keys(samples)));
  const found = Object.entries(MESSAGES).flatMap(([key, table]) => {
    if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
      return [`MESSAGES.${key} has [${Object.keys(table)}]`];
    }
    return LANGS.flatMap((lang) =>
      textProblems(table[lang](...samples[key]), `MESSAGES.${key}.${lang}`, lang, MAX.message),
    );
  });
  assert.deepEqual(found, []);
});

test('the feature names exist in every language, distinct on a device', () => {
  const found = [];
  for (const lang of LANGS) {
    const names = FEATURE_NAMES[lang];
    if (
      JSON.stringify(sorted(Object.keys(names))) !==
      JSON.stringify(sorted(Object.keys(FEATURE_NAMES.en)))
    ) {
      found.push(`FEATURE_NAMES.${lang} does not have the keys of FEATURE_NAMES.en`);
    }
    for (const [key, name] of Object.entries(names)) {
      found.push(...textProblems(name, `FEATURE_NAMES.${lang}.${key}`, lang, MAX.featureName));
    }
    assert.equal(new Set(Object.values(names)).size, Object.values(names).length);
  }
  assert.deepEqual(found, []);
});

// --- Documentation ---------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The outline of a document: the level of each heading, in order. */
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentation pages have the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.filter((level) => level === 2).length >= 8, 'docs/en.md: too few sections');
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md does not follow docs/en.md`);
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('every documentation page names each scene action, the trigger and the widget', () => {
  const keys = [
    ...manifest.scene_actions.map((action) => action.label),
    ...manifest.scene_triggers.map((trigger) => trigger.label),
    ...manifest.widgets.map((widget) => widget.label),
  ];
  for (const lang of LANGS) {
    for (const label of keys) {
      assert.ok(
        docs[lang].includes(label[lang]),
        `docs/${lang}.md does not mention "${label[lang]}"`,
      );
    }
    assert.match(docs[lang], /OurGroceries/);
  }
});

test('the German documentation says "du", the Spanish one "usted"', () => {
  for (const line of docs.de.split('\n')) {
    assert.equal(POLITE_GERMAN.test(line), false, `docs/de.md: "${line}"`);
  }
  for (const line of docs.es.split('\n')) {
    assert.equal(INFORMAL_SPANISH.test(line), false, `docs/es.md: "${line}"`);
  }
});

test('the guard catches a missing language, an empty text and the wrong forms', () => {
  assert.equal(problems({ en: 'List', fr: 'Liste', de: 'Liste' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'List', fr: 'Liste', de: '', es: 'Lista' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Konto', 'Ihre Liste', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  for (const informal of ['Introduce tu correo', 'Si quieres, elige una lista']) {
    assert.equal(
      problems({ en: 'a', fr: 'a', de: 'a', es: informal }, 'x', 60).length,
      1,
      informal,
    );
  }
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].fields[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[0].fields[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
  // Docs whose sections differ are found.
  assert.notDeepEqual(outline('## A\n## B\n'), outline('## A\n### B\n'));
});
