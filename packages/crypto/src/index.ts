/**
 * Núcleo criptográfico de Keyme (formato v1). Ver docs/security.md y docs/format.md.
 *
 * Reglas:
 *  - Nada de criptografía propia: todo sale de libsodium.
 *  - Todo lo binario viaja como base64url sin relleno.
 *  - Cada blob cifrado empieza con un byte de versión y lleva AAD que lo ata
 *    a su contexto (tipo + id), así un bloque no puede moverse a otro registro.
 */
import sodium from 'libsodium-wrappers-sumo';

export const FORMAT_VERSION = 1;
export const KEY_BYTES = 32;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 24;
export const AUTH_KEY_BYTES = 32;
export const ATTACHMENT_CHUNK = 64 * 1024;

const KDF_CONTEXT_WRAP = 'kmwrap01';
const KDF_CONTEXT_AUTH = 'kmauth01';
const KDF_CONTEXT_PRF = 'kmprf001';

export interface KdfParams {
  alg: 'argon2id13';
  /** Iteraciones de Argon2id (opslimit). */
  ops: number;
  /** Memoria en bytes (memlimit). */
  mem: number;
}

export const DEFAULT_KDF: KdfParams = { alg: 'argon2id13', ops: 3, mem: 64 * 1024 * 1024 };

export interface DerivedKeys {
  wrapKey: Uint8Array;
  /** Prueba ante el servidor que conoces la contraseña; base64url. */
  authKey: string;
}

export interface NewVault {
  salt: string;
  params: KdfParams;
  vaultKey: Uint8Array;
  wrappedVaultKey: string;
  authKey: string;
}

let readyPromise: Promise<void> | null = null;

export function ready(): Promise<void> {
  readyPromise ??= sodium.ready;
  return readyPromise;
}

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

export function toB64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export function fromB64(text: string): Uint8Array {
  return sodium.from_base64(text, sodium.base64_variants.URLSAFE_NO_PADDING);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

export function randomBytes(n: number): Uint8Array {
  return sodium.randombytes_buf(n);
}

export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const b of buffers) if (b) sodium.memzero(b);
}

// ---------------------------------------------------------------------------
// Llaves
// ---------------------------------------------------------------------------

/** Contraseña maestra + salt → Master Key (Argon2id) → Wrap Key y Auth Key. */
export function deriveKeys(password: string, salt: string, params: KdfParams): DerivedKeys {
  if (params.alg !== 'argon2id13') throw new Error(`KDF no soportado: ${params.alg}`);
  const master = sodium.crypto_pwhash(
    KEY_BYTES,
    password.normalize('NFC'),
    fromB64(salt),
    params.ops,
    params.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const wrapKey = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CONTEXT_WRAP, master);
  const auth = sodium.crypto_kdf_derive_from_key(AUTH_KEY_BYTES, 2, KDF_CONTEXT_AUTH, master);
  const authKey = toB64(auth);
  wipe(master, auth);
  return { wrapKey, authKey };
}

export function createVault(password: string, params: KdfParams = DEFAULT_KDF): NewVault {
  const salt = toB64(randomBytes(SALT_BYTES));
  const { wrapKey, authKey } = deriveKeys(password, salt, params);
  const vaultKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
  const wrappedVaultKey = wrapVaultKey(vaultKey, wrapKey);
  wipe(wrapKey);
  return { salt, params, vaultKey, wrappedVaultKey, authKey };
}

export function wrapVaultKey(vaultKey: Uint8Array, wrapKey: Uint8Array): string {
  return seal(wrapKey, vaultKey, 'vaultkey');
}

/** Lanza si la llave no corresponde (contraseña equivocada o blob alterado). */
export function unwrapVaultKey(wrapped: string, wrapKey: Uint8Array): Uint8Array {
  return open(wrapKey, wrapped, 'vaultkey');
}

/** Contraseña nueva: mismo vault key, nuevo salt y nueva envoltura. */
export function rekey(vaultKey: Uint8Array, newPassword: string, params: KdfParams = DEFAULT_KDF) {
  const salt = toB64(randomBytes(SALT_BYTES));
  const { wrapKey, authKey } = deriveKeys(newPassword, salt, params);
  const wrappedVaultKey = wrapVaultKey(vaultKey, wrapKey);
  wipe(wrapKey);
  return { salt, params, wrappedVaultKey, authKey };
}

export function newVaultKey(): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

/**
 * Desbloqueo con Windows Hello / passkey: la salida PRF de WebAuthn (32 bytes,
 * estable por credencial) se pasa por KDF y esa llave envuelve la Vault Key.
 */
export function prfWrapKey(prfOutput: Uint8Array): Uint8Array {
  const base = sodium.crypto_generichash(KEY_BYTES, prfOutput, null);
  const key = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CONTEXT_PRF, base);
  wipe(base);
  return key;
}

export function wrapWithPrf(vaultKey: Uint8Array, prfOutput: Uint8Array): string {
  const key = prfWrapKey(prfOutput);
  try {
    return seal(key, vaultKey, 'prf');
  } finally {
    wipe(key);
  }
}

export function unwrapWithPrf(wrapped: string, prfOutput: Uint8Array): Uint8Array {
  const key = prfWrapKey(prfOutput);
  try {
    return open(key, wrapped, 'prf');
  } finally {
    wipe(key);
  }
}

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------

export function encryptItem(vaultKey: Uint8Array, id: string, payload: unknown): string {
  return seal(vaultKey, utf8(JSON.stringify(payload)), `item:${id}`);
}

export function decryptItem<T = unknown>(vaultKey: Uint8Array, id: string, blob: string): T {
  return JSON.parse(fromUtf8(open(vaultKey, blob, `item:${id}`))) as T;
}

// ---------------------------------------------------------------------------
// Primitiva: blob versionado [version][nonce 24][ciphertext + tag 16]
// ---------------------------------------------------------------------------

function aad(context: string, version: number): Uint8Array {
  return utf8(`keyme:v${version}:${context}`);
}

/** Exportado solo para los vectores de prueba (nonce fijo). */
export function sealWithNonce(key: Uint8Array, plain: Uint8Array, context: string, nonce: Uint8Array): string {
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, aad(context, FORMAT_VERSION), null, nonce, key);
  const out = new Uint8Array(1 + NONCE_BYTES + ct.length);
  out[0] = FORMAT_VERSION;
  out.set(nonce, 1);
  out.set(ct, 1 + NONCE_BYTES);
  return toB64(out);
}

export function seal(key: Uint8Array, plain: Uint8Array, context: string): string {
  return sealWithNonce(key, plain, context, randomBytes(NONCE_BYTES));
}

export function open(key: Uint8Array, blob: string, context: string): Uint8Array {
  const raw = fromB64(blob);
  const version = raw[0];
  if (version !== FORMAT_VERSION) throw new Error(`Formato de blob no soportado: v${version}`);
  if (raw.length < 1 + NONCE_BYTES + 16) throw new Error('Blob truncado');
  const nonce = raw.subarray(1, 1 + NONCE_BYTES);
  const ct = raw.subarray(1 + NONCE_BYTES);
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, aad(context, version), nonce, key);
  } catch {
    throw new DecryptError();
  }
}

export class DecryptError extends Error {
  constructor() {
    super('No se pudo descifrar: llave incorrecta o datos alterados');
    this.name = 'DecryptError';
  }
}

// ---------------------------------------------------------------------------
// Adjuntos: crypto_secretstream por bloques
// Formato: [version 1][header 24][bloque cifrado (64 KiB + 17)]...
// ---------------------------------------------------------------------------

export function newAttachmentKey(): Uint8Array {
  return sodium.crypto_secretstream_xchacha20poly1305_keygen();
}

export function encryptAttachment(key: Uint8Array, data: Uint8Array): Uint8Array {
  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
  const chunks: Uint8Array[] = [Uint8Array.of(FORMAT_VERSION), header];
  const total = Math.max(1, Math.ceil(data.length / ATTACHMENT_CHUNK));
  for (let i = 0; i < total; i++) {
    const part = data.subarray(i * ATTACHMENT_CHUNK, (i + 1) * ATTACHMENT_CHUNK);
    const tag = i === total - 1
      ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
    chunks.push(sodium.crypto_secretstream_xchacha20poly1305_push(state, part, null, tag));
  }
  return concat(chunks);
}

export function decryptAttachment(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data[0] !== FORMAT_VERSION) throw new Error(`Formato de adjunto no soportado: v${data[0]}`);
  const headerBytes = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
  const abytes = sodium.crypto_secretstream_xchacha20poly1305_ABYTES;
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(data.subarray(1, 1 + headerBytes), key);
  const out: Uint8Array[] = [];
  let offset = 1 + headerBytes;
  let finished = false;
  while (offset < data.length) {
    const end = Math.min(offset + ATTACHMENT_CHUNK + abytes, data.length);
    const res = sodium.crypto_secretstream_xchacha20poly1305_pull(state, data.subarray(offset, end), null);
    if (!res) throw new DecryptError();
    out.push(res.message);
    offset = end;
    if (res.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
      finished = true;
      break;
    }
  }
  if (!finished || offset !== data.length) throw new DecryptError();
  return concat(out);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exportación .keyme: independiente del servidor, con su propia contraseña
// ---------------------------------------------------------------------------

export interface KeymeExport {
  format: 'keyme-export';
  version: 1;
  created_at: string;
  kdf: KdfParams & { salt: string };
  data: string;
}

export function encryptExport(password: string, payload: unknown, params: KdfParams = DEFAULT_KDF): KeymeExport {
  const salt = toB64(randomBytes(SALT_BYTES));
  const { wrapKey } = deriveKeys(password, salt, params);
  try {
    return {
      format: 'keyme-export',
      version: 1,
      created_at: new Date().toISOString(),
      kdf: { ...params, salt },
      data: seal(wrapKey, utf8(JSON.stringify(payload)), 'export'),
    };
  } finally {
    wipe(wrapKey);
  }
}

export function decryptExport<T = unknown>(password: string, file: KeymeExport): T {
  if (file.format !== 'keyme-export' || file.version !== 1) throw new Error('No es un archivo .keyme válido');
  const { salt, ...params } = file.kdf;
  const { wrapKey } = deriveKeys(password, salt, params);
  try {
    return JSON.parse(fromUtf8(open(wrapKey, file.data, 'export'))) as T;
  } finally {
    wipe(wrapKey);
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** SHA-1 en mayúsculas para Have I Been Pwned (k-anonymity: solo se envían 5 caracteres). */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', utf8(text) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Entero uniforme en [0, max) sin sesgo de módulo. */
export function randomInt(max: number): number {
  return sodium.randombytes_uniform(max);
}
