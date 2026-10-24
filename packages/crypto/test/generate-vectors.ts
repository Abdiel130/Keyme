// Genera test/vectors.json. Solo se corre una vez por versión de formato:
// si este archivo cambia, se rompió la compatibilidad con vaults existentes.
import { writeFileSync } from 'node:fs';
import * as k from '../src/index.ts';

await k.ready();
const password = 'correcto caballo batería grapa ñandú';
const salt = k.toB64(Uint8Array.from({ length: 16 }, (_, i) => i));
const params = k.DEFAULT_KDF;
const derived = k.deriveKeys(password, salt, params);
const vaultKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const nonce = Uint8Array.from({ length: 24 }, (_, i) => i * 3);
const itemId = '0192f3a0-0000-7000-8000-000000000001';
const item = { type: 'login', title: 'Google · Personal', username: 'yo@gmail.com', password: 'pa$$wörd', urls: ['https://accounts.google.com'] };

const vectors = {
  version: k.FORMAT_VERSION,
  password,
  salt,
  params,
  wrap_key: k.toB64(derived.wrapKey),
  auth_key: derived.authKey,
  vault_key: k.toB64(vaultKey),
  wrapped_vault_key: k.sealWithNonce(derived.wrapKey, vaultKey, 'vaultkey', nonce),
  item_id: itemId,
  item,
  item_blob: k.sealWithNonce(vaultKey, k.utf8(JSON.stringify(item)), `item:${itemId}`, nonce),
};
writeFileSync(new URL('./vectors.json', import.meta.url), JSON.stringify(vectors, null, 2) + '\n');
console.log('vectors.json escrito');
