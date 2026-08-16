/**
 * Turns an Apple "Sign in with Apple" key into the client secret Supabase wants.
 *
 *   node scripts/apple-secret.mjs \
 *     --team ABCDE12345 \
 *     --key-id XYZ9876543 \
 *     --services-id com.you.chipledger.web \
 *     --p8 ~/Downloads/AuthKey_XYZ9876543.p8
 *
 * Apple doesn't hand you a client secret. It hands you a private key, and expects
 * a JWT signed with it. Plenty of websites offer to do this for you — don't use
 * them. That .p8 is the credential that lets anyone sign people into your app, and
 * pasting it into a stranger's server gives it away. This does it on your machine
 * with Node's built-in crypto and nothing else.
 *
 * Apple caps the lifetime at six months, so this expires and you'll need to run it
 * again. It prints the expiry date so you can put it in a calendar.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((pair) => {
      const [key, ...rest] = pair.trim().split(/\s+/);
      return [key, rest.join(' ')];
    }),
);

const required = ['team', 'key-id', 'services-id', 'p8'];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`Missing: ${missing.map((m) => `--${m}`).join(', ')}\n`);
  console.error('Usage:');
  console.error('  node scripts/apple-secret.mjs \\');
  console.error('    --team ABCDE12345 \\');
  console.error('    --key-id XYZ9876543 \\');
  console.error('    --services-id com.you.chipledger.web \\');
  console.error('    --p8 ./AuthKey_XYZ9876543.p8');
  process.exit(1);
}

const privateKey = readFileSync(args.p8.replace(/^~/, process.env.HOME ?? '~'), 'utf8');
if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  console.error(`That doesn't look like a .p8 key file: ${args.p8}`);
  process.exit(1);
}

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const SIX_MONTHS = 15777000; // Apple's hard ceiling, in seconds.
const expires = now + SIX_MONTHS;

const header = base64url(JSON.stringify({ alg: 'ES256', kid: args['key-id'] }));
const payload = base64url(
  JSON.stringify({
    iss: args.team,
    iat: now,
    exp: expires,
    aud: 'https://appleid.apple.com',
    sub: args['services-id'],
  }),
);

// Apple wants a raw r||s signature, which is what the 'ieee-p1363' format gives.
const signer = createSign('SHA256');
signer.update(`${header}.${payload}`);
const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

const token = `${header}.${payload}.${base64url(signature)}`;

console.log('\nPaste this into Supabase as the Apple "Secret Key":\n');
console.log(token);
console.log(`\nExpires ${new Date(expires * 1000).toDateString()} — put a reminder in your calendar.`);
console.log('Run this again before then, or Apple sign-in stops working.\n');
