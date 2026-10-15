// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
//
// A device integration does not receive the language of the user, nor does a
// scene action: the `language` field of the configuration picks it (French by
// default). A widget receives the language of the dashboard viewer.
// Brand and item names are never translated.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Texts without parameters (multi-language objects, as Gladys takes them). */
export const TEXT = {
  notConfigured: {
    en: 'Enter the email and password of your OurGroceries account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte OurGroceries.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines OurGroceries-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta de OurGroceries.',
  },
  authFailed: {
    en: 'OurGroceries refused the email or the password: check them, then save.',
    fr: 'OurGroceries a refusé l’e-mail ou le mot de passe : vérifiez-les, puis enregistrez.',
    de: 'OurGroceries hat die E-Mail-Adresse oder das Passwort abgelehnt: Prüfe sie und speichere.',
    es: 'OurGroceries ha rechazado el correo o la contraseña: compruébelos y guarde.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  emptyList: {
    en: 'Nothing left to buy',
    fr: 'Plus rien à acheter',
    de: 'Nichts mehr zu kaufen',
    es: 'Nada más que comprar',
  },
  toBuy: { en: 'To buy', fr: 'À acheter', de: 'Zu kaufen', es: 'Por comprar' },
  add: { en: 'Add', fr: 'Ajouter', de: 'Hinzufügen', es: 'Añadir' },
  crossOff: { en: 'Cross off', fr: 'Cocher', de: 'Abhaken', es: 'Tachar' },
  clearCrossed: {
    en: 'Clear crossed',
    fr: 'Vider cochés',
    de: 'Erledigte weg',
    es: 'Quitar tachados',
  },
  itemField: { en: 'Item', fr: 'Article', de: 'Artikel', es: 'Artículo' },
  itemPlaceholder: {
    en: 'e.g. Milk',
    fr: 'ex. Lait',
    de: 'z. B. Milch',
    es: 'p. ej. Leche',
  },
  itemToCrossOff: {
    en: 'Item to cross off',
    fr: 'Article à cocher',
    de: 'Abzuhakender Artikel',
    es: 'Artículo que tachar',
  },
  pickList: {
    en: 'Choose a shopping list in the widget settings.',
    fr: 'Choisissez une liste de courses dans les réglages du widget.',
    de: 'Wähle eine Einkaufsliste in den Einstellungen des Widgets.',
    es: 'Elija una lista de la compra en los ajustes del widget.',
  },
  listGone: {
    en: 'This list no longer exists in OurGroceries.',
    fr: 'Cette liste n’existe plus dans OurGroceries.',
    de: 'Diese Liste gibt es in OurGroceries nicht mehr.',
    es: 'Esta lista ya no existe en OurGroceries.',
  },
  unreachable: {
    en: 'OurGroceries does not answer right now: the list will come back by itself.',
    fr: 'OurGroceries ne répond pas pour le moment : la liste reviendra d’elle-même.',
    de: 'OurGroceries antwortet gerade nicht: Die Liste kommt von selbst zurück.',
    es: 'OurGroceries no responde en este momento: la lista volverá por sí sola.',
  },
  itemGone: {
    en: 'This item is no longer on the list.',
    fr: 'Cet article n’est plus sur la liste.',
    de: 'Dieser Artikel steht nicht mehr auf der Liste.',
    es: 'Este artículo ya no está en la lista.',
  },
  nothingToClear: {
    en: 'No crossed-off item to delete.',
    fr: 'Aucun article coché à supprimer.',
    de: 'Kein abgehakter Artikel zum Löschen.',
    es: 'No hay ningún artículo tachado que eliminar.',
  },
  emptyItem: {
    en: 'The item name is empty.',
    fr: 'Le nom de l’article est vide.',
    de: 'Der Artikelname ist leer.',
    es: 'El nombre del artículo está vacío.',
  },
  unknownList: {
    en: 'Unknown shopping list: choose one of the lists added to Gladys.',
    fr: 'Liste de courses inconnue : choisissez une des listes ajoutées à Gladys.',
    de: 'Unbekannte Einkaufsliste: Wähle eine der zu Gladys hinzugefügten Listen.',
    es: 'Lista de la compra desconocida: elija una de las listas añadidas a Gladys.',
  },
};

/** Texts with parameters: one function per language. */
export const MESSAGES = {
  unreachableStatus: {
    en: (reason) => `OurGroceries is unreachable (${reason}).`,
    fr: (reason) => `OurGroceries est injoignable (${reason}).`,
    de: (reason) => `OurGroceries ist nicht erreichbar (${reason}).`,
    es: (reason) => `OurGroceries no está disponible (${reason}).`,
  },
  connected: {
    en: (lists, added) =>
      `Connected: ${lists} shopping list(s) in the account, ${added} added to Gladys.`,
    fr: (lists, added) =>
      `Connecté : ${lists} liste(s) de courses sur le compte, ${added} ajoutée(s) à Gladys.`,
    de: (lists, added) =>
      `Verbunden: ${lists} Einkaufsliste(n) im Konto, ${added} zu Gladys hinzugefügt.`,
    es: (lists, added) =>
      `Conectado: ${lists} lista(s) de la compra en la cuenta, ${added} añadida(s) a Gladys.`,
  },
  more: {
    en: (count) => `And ${count} more`,
    fr: (count) => `Et ${count} de plus`,
    de: (count) => `Und ${count} weitere`,
    es: (count) => `Y ${count} más`,
  },
  added: {
    en: (name) => `Added: ${name}`,
    fr: (name) => `Ajouté : ${name}`,
    de: (name) => `Hinzugefügt: ${name}`,
    es: (name) => `Añadido: ${name}`,
  },
  restored: {
    en: (name) => `Back on the list: ${name}`,
    fr: (name) => `De retour sur la liste : ${name}`,
    de: (name) => `Wieder auf der Liste: ${name}`,
    es: (name) => `De nuevo en la lista: ${name}`,
  },
  alreadyThere: {
    en: (name) => `Already on the list: ${name}`,
    fr: (name) => `Déjà sur la liste : ${name}`,
    de: (name) => `Steht schon auf der Liste: ${name}`,
    es: (name) => `Ya está en la lista: ${name}`,
  },
  crossedOff: {
    en: (name) => `Crossed off: ${name}`,
    fr: (name) => `Coché : ${name}`,
    de: (name) => `Abgehakt: ${name}`,
    es: (name) => `Tachado: ${name}`,
  },
  cleared: {
    en: (count) => `${count} crossed-off item(s) deleted.`,
    fr: (count) => `${count} article(s) coché(s) supprimé(s).`,
    de: (count) => `${count} abgehakte(r) Artikel gelöscht.`,
    es: (count) => `${count} artículo(s) tachado(s) eliminado(s).`,
  },
};

/** Feature names, frozen at creation in the language of the configuration. */
export const FEATURE_NAMES = {
  en: { remaining: 'Items to buy', crossed_off: 'Crossed-off items', items: 'List' },
  fr: { remaining: 'Articles à acheter', crossed_off: 'Articles cochés', items: 'Liste' },
  de: { remaining: 'Zu kaufende Artikel', crossed_off: 'Abgehakte Artikel', items: 'Liste' },
  es: { remaining: 'Artículos por comprar', crossed_off: 'Artículos tachados', items: 'Lista' },
};

/** The language to use, English when unknown. */
export const pickLanguage = (language) => (LANGUAGES.includes(language) ? language : 'en');

/** One language of a multi-language object. */
export const textIn = (text, language) => text[pickLanguage(language)] ?? text.en;

/** A message with parameters, in all four languages. */
export function message(table, ...args) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, table[lang](...args)]));
}
