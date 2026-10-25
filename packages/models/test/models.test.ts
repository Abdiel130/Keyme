import { describe, expect, it } from 'vitest';
import * as m from '../src/index';

describe('modelos', () => {
  it('dominios', () => {
    expect(m.hostOf('https://www.Google.com/x')).toBe('google.com');
    expect(m.baseDomain('accounts.google.com')).toBe('google.com');
    expect(m.baseDomain('portal.sat.gob.mx')).toBe('sat.gob.mx');
  });

  it('coincidencia exacta, sin parecidos', () => {
    const e = m.newEntry('login', null);
    e.urls = [{ value: 'https://accounts.google.com', match: 'base' }];
    expect(m.matchesUrl(e, 'https://mail.google.com')).toBe(true);
    expect(m.matchesUrl(e, 'https://google.com.evil.io')).toBe(false);
    expect(m.matchesUrl(e, 'https://gooogle.com')).toBe(false);
    e.urls = [{ value: 'accounts.google.com', match: 'host' }];
    expect(m.matchesUrl(e, 'https://mail.google.com')).toBe(false);
  });

  it('tarjetas', () => {
    expect(m.detectNetwork('4111 1111 1111 1111')).toBe('visa');
    expect(m.detectNetwork('5555555555554444')).toBe('mastercard');
    expect(m.detectNetwork('378282246310005')).toBe('amex');
    expect(m.luhnValid('4111111111111111')).toBe(true);
    expect(m.luhnValid('4111111111111112')).toBe(false);
    expect(m.formatCard('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(m.formatCard('378282246310005')).toBe('3782 822463 10005');
  });

  it('vencimientos', () => {
    const d = m.newEntry('document', null);
    d.expiresAt = '2026-11-10';
    const c = m.newEntry('card', null);
    c.expiry = '12/30';
    const soon = m.expiringSoon([d, c], 30, new Date('2026-10-24T12:00:00'));
    expect(soon.map((s) => s.entry.id)).toEqual([d.id]);
  });

  it('búsqueda difusa', () => {
    expect(m.fuzzyScore('gogl', 'Google Personal')).toBeGreaterThan(0);
    expect(m.fuzzyScore('xyz', 'Google')).toBe(0);
    expect(m.fuzzyScore('cafe', 'Café Punta')).toBeGreaterThan(m.fuzzyScore('cafe', 'Cuenta de facturas'));
  });

  it('uuid v7', () => {
    expect(m.uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('QR wifi', () => {
    expect(m.wifiQrPayload({ ssid: 'Casa;1', password: 'p:w', security: 'WPA', hidden: false })).toBe(String.raw`WIFI:T:WPA;S:Casa\;1;P:p\:w;;`);
  });
});
