// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two reads of OurGroceries. The service has no public API
// and no published quota: the web endpoints the official site uses are read
// at a pace a person refreshing the page would not exceed.
export const REFRESH_MINUTES = ['2', '5', '10', '15', '30'];

export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  refresh_minutes: '5',
  language: 'fr',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  return {
    email: typeof config.email === 'string' ? config.email.trim() : '',
    // A password may start or end with a space: kept as typed.
    password: typeof config.password === 'string' ? config.password : '',
    refresh_minutes: REFRESH_MINUTES.includes(String(config.refresh_minutes))
      ? String(config.refresh_minutes)
      : DEFAULT_CONFIG.refresh_minutes,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}

/** Both credentials are filled in. */
export function isConfigured(config) {
  return config.email !== '' && config.password !== '';
}

/** Refresh period, in milliseconds. */
export function refreshPeriodMs(config) {
  return Number(config.refresh_minutes) * 60 * 1000;
}
