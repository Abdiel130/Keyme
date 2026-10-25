import { Injectable, computed, signal } from '@angular/core';

/** Evento no estándar de Chromium (Chrome, Edge, Samsung Internet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'prompt' | 'ios' | 'manual';

/**
 * Instalación de la PWA. En Chromium se guarda `beforeinstallprompt` para
 * mostrarlo desde un botón propio; en iOS y Firefox no existe y se dan
 * instrucciones.
 */
@Injectable({ providedIn: 'root' })
export class InstallPrompt {
  private deferred = signal<BeforeInstallPromptEvent | null>(null);
  private standalone = signal(isStandalone());

  readonly installed = computed(() => this.standalone());
  readonly platform = computed<InstallPlatform>(() => (this.deferred() ? 'prompt' : isIos() ? 'ios' : 'manual'));
  /** Se ofrece instalar mientras no se esté usando ya como app. */
  readonly available = computed(() => !this.standalone());

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred.set(e as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred.set(null);
      this.standalone.set(true);
    });
    matchMedia('(display-mode: standalone)').addEventListener('change', (e) => this.standalone.set(e.matches || isStandalone()));
  }

  /** Abre el diálogo nativo. Devuelve false si no hay diálogo y hacen falta instrucciones. */
  async install(): Promise<boolean> {
    const event = this.deferred();
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // El evento solo sirve una vez; Chromium manda otro si se puede volver a ofrecer.
    this.deferred.set(null);
    if (outcome === 'accepted') this.standalone.set(true);
    return true;
  }
}

function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
