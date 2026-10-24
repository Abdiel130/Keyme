import { db, type PrfMeta } from './db';

/**
 * Desbloqueo con Windows Hello / passkey usando la extensión PRF de WebAuthn.
 * Todo es local: el autenticador devuelve un secreto estable (PRF) que solo
 * sale si el usuario se verifica (huella, rostro o PIN), y ese secreto
 * envuelve la Vault Key en IndexedDB. El servidor no participa.
 */
export const PASSWORD_EVERY_DAYS = 14;

// Base64url local: importar @keyme/crypto aquí metería libsodium en el bundle inicial.
function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function rand(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

export async function prfSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential || !isSecureContext) return false;
  try {
    const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.();
    if (caps && 'extension:prf' in caps) return !!caps['extension:prf'];
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Registra la credencial y devuelve la salida PRF (o null si el autenticador no soporta PRF). */
export async function registerPrf(): Promise<{ credentialId: string; salt: string; prf: string } | null> {
  const salt = rand(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Keyme', id: location.hostname },
      user: { id: rand(16), name: 'keyme', displayName: 'Keyme' },
      challenge: rand(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return null;
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (ext.prf?.enabled === false) return null;
  const credentialId = toB64(new Uint8Array(cred.rawId));
  const saltB64 = toB64(salt);
  // Algunos autenticadores solo devuelven el PRF al autenticar, no al registrar.
  const first = ext.prf?.results?.first ?? (await evaluatePrf(credentialId, saltB64));
  if (!first) return null;
  return { credentialId, salt: saltB64, prf: toB64(new Uint8Array(first)) };
}

async function evaluatePrf(credentialId: string, salt: string): Promise<ArrayBuffer | null> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64urlToBytes(credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: b64urlToBytes(salt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const ext = assertion?.getClientExtensionResults() as PrfResults | undefined;
  return ext?.prf?.results?.first ?? null;
}

export async function getPrf(meta: PrfMeta): Promise<string | null> {
  const out = await evaluatePrf(meta.credentialId, meta.salt);
  return out ? toB64(new Uint8Array(out)) : null;
}

/** ¿Hay Windows Hello configurado y vigente para este origen? */
export async function prfStatus(): Promise<{ meta: PrfMeta | null; passwordDue: boolean }> {
  const meta = (await db.getMeta<PrfMeta>('prf')) ?? null;
  const last = await db.getMeta<string>('lastPasswordAt');
  const passwordDue = !last || Date.now() - +new Date(last) > PASSWORD_EVERY_DAYS * 86_400_000;
  return { meta: meta && meta.rpId === location.hostname ? meta : null, passwordDue };
}
