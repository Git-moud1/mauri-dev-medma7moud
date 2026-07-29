/**
 * TEMPORARY build-time diagnostics. DELETE once the preview login is fixed.
 *
 * Answers exactly one question: did the *build* environment see the two admin
 * variables? That is a different question from whether the *function* sees them
 * at request time — Netlify scopes those separately — so this pairs with the
 * `[authdiag]` runtime line in the function log. Build-yes / runtime-no is the
 * signature of a variable that is missing the Functions scope.
 *
 * Presence, length and shape only. No value, and no substring of a value, is
 * ever printed: a build log is not a secret store, and this one is attached to
 * a deploy on a public repository.
 */

function describe(name) {
  const raw = process.env[name];
  if (!raw) return { name, present: false };
  return {
    name,
    present: true,
    length: raw.length,
    // A trimmed length that differs means a newline or space rode along with
    // the paste into the Netlify UI. Harmless for the base64 hash (the decoder
    // ignores whitespace) and fatal for AUTH_SECRET (TextEncoder does not).
    trimmedLength: raw.trim().length,
  };
}

function describeHashShape() {
  const raw = process.env.ADMIN_PASSWORD_HASH;
  if (!raw) return 'absent';
  if (raw.startsWith('$argon2')) return 'raw-argon2';
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  if (decoded.startsWith('$argon2')) return 'base64-argon2';
  // Buffer's base64 decoder never throws — it silently drops anything outside
  // the alphabet — so an unrecognised shape here is the only signal that the
  // value was mangled in transit.
  return 'unrecognised';
}

console.log(
  '[authdiag:build] ' +
    JSON.stringify({
      context: process.env.CONTEXT ?? 'none',
      branch: process.env.BRANCH ?? 'none',
      commit: process.env.COMMIT_REF?.slice(0, 7) ?? 'none',
      nodeEnv: process.env.NODE_ENV ?? 'none',
      hash: describe('ADMIN_PASSWORD_HASH'),
      hashShape: describeHashShape(),
      secret: describe('AUTH_SECRET'),
    }),
);
