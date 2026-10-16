/* Notebook encryption. One module for the browser (window.UPSCNotebookCrypto)
   and for node (module.exports); both use WebCrypto so a file encrypted by a
   scheduled task decrypts in the page and the other way round.

   Scheme
     Each file: a fresh AES-256-GCM key encrypts the bytes; the AES key is
     wrapped with the notebook's RSA-OAEP (SHA-256, 3072-bit) public key.
       {"v":1,"kid":"…","alg":"RSA-OAEP-256+A256GCM","ek":"…","iv":"…","ct":"…"}
     The private key is kept two ways: passphrase-wrapped in the repo for the
     browser (PBKDF2-SHA256, 600k iterations, AES-256-GCM), and as a plain JWK
     in a private Project doc for the scheduled tasks.
       {"v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"…","iv":"…","ct":"…"}
   Anyone can encrypt (the public key is public); only the private key reads. */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto);
  else root.UPSCNotebookCrypto = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  'use strict';

  var subtle = webcrypto && webcrypto.subtle;
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var PBKDF2_ITERATIONS = 600000;

  function b64(bytes) {
    var bin = '';
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }
  function unb64(str) {
    var bin = atob(String(str || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  function random(n) { var a = new Uint8Array(n); webcrypto.getRandomValues(a); return a; }

  function hex(bytes) {
    return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  var RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };

  function generateKeyPair() {
    return subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'])
      .then(function (pair) {
        return Promise.all([subtle.exportKey('jwk', pair.publicKey), subtle.exportKey('jwk', pair.privateKey)]);
      })
      .then(function (jwks) {
        var pub = { kty: jwks[0].kty, n: jwks[0].n, e: jwks[0].e, alg: 'RSA-OAEP-256', ext: true, key_ops: ['wrapKey', 'encrypt'] };
        var priv = jwks[1];
        return keyId(pub).then(function (kid) {
          pub.kid = kid; priv.kid = kid;
          return { publicJwk: pub, privateJwk: priv, kid: kid };
        });
      });
  }

  function keyId(publicJwk) {
    return subtle.digest('SHA-256', enc.encode(publicJwk.n + '.' + publicJwk.e)).then(function (d) { return hex(d).slice(0, 16); });
  }

  function importPublic(jwk) {
    return subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', ext: true }, RSA, true, ['wrapKey']);
  }
  function importPrivate(jwk) {
    var copy = {};
    Object.keys(jwk).forEach(function (k) { if (k !== 'kid') copy[k] = jwk[k]; });
    copy.alg = 'RSA-OAEP-256';
    copy.key_ops = ['unwrapKey'];
    return subtle.importKey('jwk', copy, RSA, false, ['unwrapKey']);
  }

  /* Encrypt a string (or bytes) for the public key. Returns the envelope object. */
  function encrypt(publicJwk, plaintext) {
    var data = typeof plaintext === 'string' ? enc.encode(plaintext) : new Uint8Array(plaintext);
    var iv = random(12);
    return Promise.all([importPublic(publicJwk), subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']), keyId(publicJwk)])
      .then(function (r) {
        var pub = r[0], aes = r[1], kid = r[2];
        return Promise.all([subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, data), subtle.wrapKey('raw', aes, pub, RSA)])
          .then(function (parts) {
            return { v: 1, kid: publicJwk.kid || kid, alg: 'RSA-OAEP-256+A256GCM', ek: b64(parts[1]), iv: b64(iv), ct: b64(parts[0]) };
          });
      });
  }

  /* Decrypt an envelope with the private key JWK. Returns the plaintext string. */
  function decrypt(privateJwk, envelope) {
    var env = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
    if (!env || env.v !== 1 || env.alg !== 'RSA-OAEP-256+A256GCM') return Promise.reject(new Error('unsupported envelope'));
    if (privateJwk.kid && env.kid && privateJwk.kid !== env.kid) return Promise.reject(new Error('wrong key for this entry (kid ' + env.kid + ')'));
    return importPrivate(privateJwk)
      .then(function (priv) { return subtle.unwrapKey('raw', unb64(env.ek), priv, RSA, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
      .then(function (aes) { return subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, aes, unb64(env.ct)); })
      .then(function (bytes) { return dec.decode(bytes); });
  }

  function deriveKek(passphrase, salt, iterations) {
    return subtle.importKey('raw', enc.encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /* Wrap the private JWK with a passphrase for storage in the repo. */
  function wrapPrivate(privateJwk, passphrase) {
    var salt = random(16), iv = random(12);
    return deriveKek(passphrase, salt, PBKDF2_ITERATIONS).then(function (kek) {
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, kek, enc.encode(JSON.stringify(privateJwk)));
    }).then(function (ct) {
      return { v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS, kid: privateJwk.kid || null, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    });
  }

  function unwrapPrivate(wrapped, passphrase) {
    var w = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped;
    if (!w || w.v !== 1 || w.kdf !== 'PBKDF2-SHA256') return Promise.reject(new Error('unsupported key file'));
    return deriveKek(passphrase, unb64(w.salt), w.iter).then(function (kek) {
      return subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, kek, unb64(w.ct));
    }).then(function (bytes) { return JSON.parse(dec.decode(bytes)); }, function () { throw new Error('wrong passphrase'); });
  }

  function isEnvelope(text) {
    try { var j = JSON.parse(text); return !!(j && j.v === 1 && j.alg === 'RSA-OAEP-256+A256GCM' && j.ct); } catch (e) { return false; }
  }

  return {
    generateKeyPair: generateKeyPair,
    keyId: keyId,
    encrypt: encrypt,
    decrypt: decrypt,
    wrapPrivate: wrapPrivate,
    unwrapPrivate: unwrapPrivate,
    isEnvelope: isEnvelope,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS
  };
});
