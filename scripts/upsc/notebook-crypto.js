#!/usr/bin/env node
'use strict';

/*
 * Command-line front for assets/js/upsc/notebook-crypto.js, used by the
 * scheduled coordinator tasks and for local work. Node 20+ (WebCrypto).
 *
 *   keygen  --out-dir DIR                      writes public.jwk and private.jwk
 *   encrypt --public public.jwk --in FILE --out FILE.enc
 *   decrypt --private private.jwk --in FILE.enc [--out FILE]   (stdout if no --out)
 *   wrap    --private private.jwk --out private.enc            passphrase from $NB_PASSPHRASE
 *   unwrap  --in private.enc --out private.jwk                 passphrase from $NB_PASSPHRASE
 *   is-encrypted --in FILE                      exit 0 if FILE is an envelope
 *
 * The tasks fetch this file and the public key from the repository with the
 * contents API, so there is nothing to install. The private key only ever
 * comes from the Project doc; it is written to a temp file, used, and removed.
 */

const fs = require('node:fs');
const path = require('node:path');

const nbc = require(path.join(__dirname, '..', '..', 'assets', 'js', 'upsc', 'notebook-crypto.js'));

function args() {
  const out = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1]; i += 1; }
    else out._.push(argv[i]);
  }
  return out;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

async function main() {
  const a = args();
  const cmd = a._[0];
  if (cmd === 'keygen') {
    const dir = a['out-dir'] || '.';
    fs.mkdirSync(dir, { recursive: true });
    const pair = await nbc.generateKeyPair();
    fs.writeFileSync(path.join(dir, 'public.jwk'), JSON.stringify(pair.publicJwk, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'private.jwk'), JSON.stringify(pair.privateJwk) + '\n', { mode: 0o600 });
    console.log('key id ' + pair.kid + ' written to ' + dir);
    return;
  }
  if (cmd === 'encrypt') {
    const pub = readJson(a.public);
    const env = await nbc.encrypt(pub, fs.readFileSync(a.in, 'utf8'));
    fs.writeFileSync(a.out, JSON.stringify(env) + '\n');
    console.log('encrypted ' + a.in + ' -> ' + a.out + ' (kid ' + env.kid + ')');
    return;
  }
  if (cmd === 'decrypt') {
    const priv = readJson(a.private);
    const text = await nbc.decrypt(priv, fs.readFileSync(a.in, 'utf8'));
    if (a.out) fs.writeFileSync(a.out, text);
    else process.stdout.write(text);
    return;
  }
  if (cmd === 'wrap') {
    const pass = process.env.NB_PASSPHRASE;
    if (!pass) throw new Error('set NB_PASSPHRASE');
    const wrapped = await nbc.wrapPrivate(readJson(a.private), pass);
    fs.writeFileSync(a.out, JSON.stringify(wrapped) + '\n');
    console.log('wrapped private key -> ' + a.out);
    return;
  }
  if (cmd === 'unwrap') {
    const pass = process.env.NB_PASSPHRASE;
    if (!pass) throw new Error('set NB_PASSPHRASE');
    const jwk = await nbc.unwrapPrivate(fs.readFileSync(a.in, 'utf8'), pass);
    fs.writeFileSync(a.out, JSON.stringify(jwk) + '\n', { mode: 0o600 });
    console.log('unwrapped -> ' + a.out);
    return;
  }
  if (cmd === 'is-encrypted') {
    process.exit(nbc.isEnvelope(fs.readFileSync(a.in, 'utf8')) ? 0 : 1);
  }
  console.error('usage: notebook-crypto.js keygen|encrypt|decrypt|wrap|unwrap|is-encrypted …');
  process.exit(2);
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });
