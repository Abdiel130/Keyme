import { Injectable, effect, inject } from '@angular/core';
import { VaultStore } from './vault.store';

/** Bloqueo automático por inactividad y (opcional) al ocultar la pestaña. */
@Injectable({ providedIn: 'root' })
export class SessionGuard {
  private store = inject(VaultStore);
  private lastActivity = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const touch = () => (this.lastActivity = Date.now());
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, touch, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.store.settings().lockOnHide) void this.store.lock();
      if (!document.hidden) this.check();
    });

    effect(() => {
      const unlocked = this.store.state() === 'unlocked';
      if (unlocked && !this.timer) {
        this.lastActivity = Date.now();
        this.timer = setInterval(() => this.check(), 5_000);
      } else if (!unlocked && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
  }

  private check(): void {
    const minutes = this.store.settings().autoLockMinutes;
    if (minutes > 0 && Date.now() - this.lastActivity > minutes * 60_000) void this.store.lock();
  }
}
