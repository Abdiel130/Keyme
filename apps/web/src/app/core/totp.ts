import { Secret, TOTP, URI } from 'otpauth';

export interface TotpInfo {
  totp: TOTP;
  issuer: string;
  label: string;
}

/** Acepta un URI otpauth:// o un secreto base32 suelto. */
export function parseTotp(value: string | undefined): TotpInfo | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  try {
    if (v.startsWith('otpauth://')) {
      const parsed = URI.parse(v);
      if (!(parsed instanceof TOTP)) return null;
      return { totp: parsed, issuer: parsed.issuer, label: parsed.label };
    }
    const secret = Secret.fromBase32(v.replace(/\s+/g, '').toUpperCase());
    return { totp: new TOTP({ secret, digits: 6, period: 30, algorithm: 'SHA1' }), issuer: '', label: '' };
  } catch {
    return null;
  }
}

export function totpNow(info: TotpInfo, now = Date.now()): { code: string; remaining: number; period: number } {
  const period = info.totp.period;
  return {
    code: info.totp.generate({ timestamp: now }),
    remaining: period - (Math.floor(now / 1000) % period),
    period,
  };
}
