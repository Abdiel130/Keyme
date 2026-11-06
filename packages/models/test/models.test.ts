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

  it('CLABE', () => {
    expect(m.newEntry('card', null).clabe).toBe('');
    expect(m.clabeValid('032180000118359719')).toBe(true);
    expect(m.clabeValid('032 180 00011835971 9')).toBe(true);
    expect(m.clabeValid('032180000118359718')).toBe(false);
    expect(m.clabeValid('03218000011835971')).toBe(false);
    expect(m.formatClabe('032180000118359719')).toBe('032 180 00011835971 9');
    expect(m.clabeBank('012180000118359713')).toBe('BBVA');
    expect(m.clabeBank('999')).toBeNull();
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

  it('multicuenta: agrupa por servicio', () => {
    const login = (title: string, url: string, username = '') => {
      const e = m.newEntry('login', null);
      Object.assign(e, { title, username, urls: url ? [{ value: url, match: 'base' }] : [] });
      return e;
    };
    const escuela = login('Google · Escuela', 'https://accounts.google.com', 'yo@escuela.edu');
    const gmail = login('Gmail', 'mail.gmail.com', 'yo@gmail.com');
    const abuela = login('Google (Abuelita)', '', 'abuela@gmail.com');
    expect(m.serviceKey(escuela)).toBe('d:google.com');
    expect(m.serviceKey(gmail)).toBe('d:google.com');
    expect(m.serviceKey(abuela)).toBe('n:google');
    expect(m.titlePrefix('Google (Abuelita)')).toBe('Google');
    expect(m.serviceName([escuela, gmail])).toBe('Google');

    const banca = login('BBVA · Banca en línea', 'https://www.bbva.mx', 'cliente1');
    const card = m.newEntry('card', null);
    Object.assign(card, { title: 'BBVA Azul', bank: 'BBVA', number: '4111111111111111' });
    expect(m.serviceKey(card)).toBe('n:bbva');
    card.loginId = banca.id;
    const byId = (id: string) => (id === banca.id ? banca : undefined);
    expect(m.serviceKey(card, byId)).toBe(m.serviceKey(banca));
    expect(m.serviceName([card, banca])).toBe('BBVA');
  });

  it('multicuenta: etiqueta de cada cuenta', () => {
    const e = m.newEntry('login', null);
    e.title = 'Google · Escuela';
    expect(m.accountLabel(e)).toBe('Escuela');
    e.username = 'yo@escuela.edu';
    expect(m.accountLabel(e)).toBe('yo@escuela.edu');
    const c = m.newEntry('card', null);
    Object.assign(c, { title: 'BBVA', number: '4111111111111111' });
    expect(m.accountLabel(c)).toBe('Tarjeta · •••• 1111');
    expect(m.normalizeEntry({ id: 'x', kind: 'login' } as never).ownerId).toBeNull();
  });
});

