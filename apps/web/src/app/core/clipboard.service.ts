import { Injectable, inject } from '@angular/core';
import { VaultStore } from './vault.store';
import { Toasts } from './toasts';

/**
 * Copia con limpieza automática. En la web solo se puede borrar el
 * portapapeles si la página sigue con foco; si no, se intenta al volver.
 */
@Injectable({ providedIn: 'root' })
export class Clipboard {
  private store = inject(VaultStore);
  private toasts = inject(Toasts);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastValue: string | null = null;

  constructor() {
    addEventListener('focus', () => {
      if (this.lastValue && !this.timer) void this.clear();
    });
  }

  async copy(value: string, what = 'Copiado', sensitive = true): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      this.toasts.show('No se pudo copiar (el navegador lo bloqueó)', 'error');
      return;
    }
    const secs = this.store.settings().clipboardSeconds;
    if (!sensitive || !secs) {
      this.toasts.show(what);
      return;
    }
    this.lastValue = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.clear();
    }, secs * 1000);
    this.toasts.show(what, 'ok', { countdown: secs });
  }

  private async clear(): Promise<void> {
    if (!document.hasFocus()) return; // se reintenta en el siguiente 'focus'
    try {
      const current = await navigator.clipboard.readText().catch(() => this.lastValue);
      if (current === this.lastValue) await navigator.clipboard.writeText('');
    } catch {
      /* sin permiso: no hay nada más que hacer */
    }
    this.lastValue = null;
  }
}
