// -----------------------------------------------------------------------------
// The OurGroceries session, kept under /data (the only writable volume).
//
// The file holds the session cookie and the team id, never the password, and
// the account they belong to as a hash of the email: when the user changes
// the account, the session of the previous one is not reused. The cookie is a
// credential: the file is written 0600 and its content is never logged.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'session.json';

const accountOf = (email) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);

/**
 * @param {object} options
 * @param {string} options.email the account the session belongs to
 * @param {string} [options.dataDir]
 */
export function createSessionStore({ email, dataDir = DEFAULT_DATA_DIR }) {
  const file = join(dataDir, FILE_NAME);
  const account = accountOf(email);
  return {
    async load() {
      try {
        const stored = JSON.parse(await readFile(file, 'utf8'));
        return stored?.account === account ? stored : null;
      } catch {
        return null;
      }
    },
    async save({ cookie, teamId }) {
      await mkdir(dataDir, { recursive: true });
      const tmp = `${file}.tmp`;
      const content = JSON.stringify({
        account,
        cookie,
        teamId,
        saved_at: new Date().toISOString(),
      });
      await writeFile(tmp, content, { mode: 0o600 });
      await rename(tmp, file);
    },
    async clear() {
      await rm(file, { force: true });
    },
  };
}
