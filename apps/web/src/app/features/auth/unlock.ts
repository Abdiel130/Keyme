import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../../core/api';
import { CryptoError } from '../../core/crypto.client';
import { VaultStore } from '../../core/vault.store';
import { PASSWORD_EVERY_DAYS, getPrf, prfStatus } from '../../core/webauthn';
import type { PrfMeta } from '../../core/db';
import { Icon } from '../../ui/icon';
import { VaultDial } from '../../ui/vault-dial';

@Component({
  selector: 'km-unlock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, VaultDial],
  templateUrl: './unlock.html',
  styleUrl: './auth.scss',
})
export class Unlock implements OnInit {
  protected store = inject(VaultStore);
  private input = viewChild<ElementRef<HTMLInputElement>>('pw');

  protected readonly password = signal('');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly opened = signal(false);
  protected readonly error = signal('');
  protected readonly shake = signal(false);
  protected readonly prf = signal<PrfMeta | null>(null);
  protected readonly passwordDue = signal(false);
  protected readonly hasLocal = signal(true);
  protected readonly days = PASSWORD_EVERY_DAYS;
  protected readonly confirmForget = signal(false);

  async ngOnInit(): Promise<void> {
    this.hasLocal.set(await this.store.hasLocalVault());
    const s = await prfStatus();
    this.prf.set(s.meta);
    this.passwordDue.set(s.passwordDue);
    // Si hay Windows Hello y no toca contraseña, se ofrece de inmediato.
    if (s.meta && !s.passwordDue && this.store.state() === 'locked') void this.hello();
  }

  protected async submit(): Promise<void> {
    const pw = this.password();
    if (!pw || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.unlock(pw);
      this.opened.set(true);
      this.password.set('');
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async hello(): Promise<void> {
    const meta = this.prf();
    if (!meta || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await getPrf(meta);
      if (!out) throw new Error('prf');
      await this.store.unlockWithPrf(out, meta.wrapped);
      this.opened.set(true);
    } catch (e) {
      const name = (e as Error).name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') this.error.set('Windows Hello no pudo desbloquear. Usa tu contraseña maestra.');
      setTimeout(() => this.input()?.nativeElement.focus());
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown): void {
    if (e instanceof CryptoError && e.code === 'bad_password') this.error.set('Contraseña incorrecta.');
    else if (e instanceof ApiError && e.code === 'throttled') this.error.set('Demasiados intentos. Espera un minuto.');
    else if (e instanceof ApiError && e.offline) this.error.set('Este dispositivo aún no tiene copia local y el servidor no responde. Enciende el servidor o revisa Tailscale.');
    else if (e instanceof ApiError && e.code === 'not_initialized') this.error.set('El servidor no tiene un vault todavía.');
    else this.error.set('No se pudo desbloquear.');
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 450);
    setTimeout(() => this.input()?.nativeElement.select());
  }

  protected async retry(): Promise<void> {
    await this.store.boot();
  }

  protected async forget(): Promise<void> {
    await this.store.forget();
    this.confirmForget.set(false);
  }
}
