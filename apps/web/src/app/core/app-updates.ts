import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import pkg from '../../../package.json';
import { VaultStore } from './vault.store';

export const APP_VERSION: string = pkg.version;

/** Cada cuánto se pregunta al servidor si hay una versión nueva. */
const CHECK_EVERY_MS = 15 * 60_000;

/**
 * Actualizaciones de la PWA. El service worker descarga la versión nueva en
 * segundo plano; aquí se decide cuándo activarla:
 * - Con el vault bloqueado se aplica sola (recargar no pierde nada).
 * - Con el vault abierto se ofrece en un aviso y, si no se acepta, se aplica
 *   en el siguiente bloqueo (manual o por inactividad).
 * Así ningún dispositivo se queda con una versión vieja más que unos minutos.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private sw = inject(SwUpdate);
  private store = inject(VaultStore);

  readonly enabled = this.sw.isEnabled;
  /** Hay una versión descargada esperando a activarse. */
  readonly ready = signal(false);
  readonly checking = signal(false);
  readonly lastCheck = signal<Date | null>(null);
  private applying = false;

  constructor() {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.ready.set(true);
      if (e.type === 'VERSION_INSTALLATION_FAILED') console.warn('Keyme: no se pudo instalar la actualización', e.error);
    });
    // La versión en caché ya no existe en el servidor: solo queda recargar.
    this.sw.unrecoverable.subscribe(() => location.reload());

    effect(() => {
      if (this.ready() && this.canApplyNow()) void this.apply();
    });

    const check = () => void this.check();
    // Al volver a la app se busca versión nueva; al salir de ella con el vault
    // bloqueado se aprovecha para aplicar la que esté lista.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
      else if (this.ready() && this.canApplyNow()) void this.apply();
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    });
    check();
  }

  /** Pregunta al servidor por una versión nueva. Devuelve true si hay una lista. */
  async check(): Promise<boolean> {
    if (!this.sw.isEnabled || !navigator.onLine || this.checking()) return this.ready();
    this.checking.set(true);
    try {
      const found = await this.sw.checkForUpdate();
      if (found) this.ready.set(true);
    } catch {
      // Sin servidor: se vuelve a intentar en el siguiente ciclo.
    } finally {
      this.checking.set(false);
      this.lastCheck.set(new Date());
    }
    return this.ready();
  }

  /** Activa la versión nueva y recarga. Recargar bloquea el vault. */
  async apply(): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      await this.sw.activateUpdate();
    } finally {
      location.reload();
    }
  }

  /**
   * Sin vault abierto se puede recargar, salvo a mitad del alta del vault o
   * mientras se escribe la contraseña en la pantalla de desbloqueo.
   */
  private canApplyNow(): boolean {
    const state = this.store.state();
    if (state === 'boot' || state === 'unlocked' || state === 'setup' || this.store.onboarding()) return false;
    return document.visibilityState === 'hidden' || !(document.activeElement instanceof HTMLInputElement && document.activeElement.value);
  }
}
