// -----------------------------------------------------------------------------
// One error type for everything OurGroceries can do wrong, with a code the
// rest of the integration branches on:
//   - `auth`: the account refused the credentials (or the session cookie);
//     retrying with the same password will not help;
//   - `network`: no answer, a timeout, a server error: retry later;
//   - `protocol`: an answer the integration does not understand (the site
//     changed): retry later, and say so in the logs.
// Messages never contain the email, the password or the session cookie.
// -----------------------------------------------------------------------------

export class OurGroceriesError extends Error {
  /**
   * @param {'auth' | 'network' | 'protocol'} code
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(code, message, options) {
    super(message, options);
    this.name = 'OurGroceriesError';
    this.code = code;
  }
}

export const isAuthError = (err) => err instanceof OurGroceriesError && err.code === 'auth';
