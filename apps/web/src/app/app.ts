import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionGuard } from './core/session.service';
import { VaultStore } from './core/vault.store';
import { Onboarding } from './features/auth/onboarding';
import { Unlock } from './features/auth/unlock';
import { Palette } from './features/shell/palette';
import { ToastsOutlet } from './ui/toasts';
import { VaultDial } from './ui/vault-dial';

@Component({
  selector: 'km-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Onboarding, Unlock, Palette, ToastsOutlet, VaultDial],
  template: `
    @switch (view()) {
      @case ('boot') { <div class="boot"><km-dial [busy]="true" /></div> }
      @case ('setup') { <km-onboarding /> }
      @case ('locked') { <km-unlock /> }
      @case ('app') { <router-outlet /><km-palette /> }
    }
    <km-toasts />
  `,
  styles: `.boot { height: 100dvh; display: grid; place-items: center; --dial: 120px; }`,
})
export class App {
  protected store = inject(VaultStore);

  protected view(): 'boot' | 'setup' | 'locked' | 'app' {
    const s = this.store.state();
    if (s === 'boot') return 'boot';
    if (s === 'setup' || this.store.onboarding()) return 'setup';
    if (s === 'unlocked') return 'app';
    return 'locked';
  }

  constructor() {
    inject(SessionGuard);
    void this.store.boot();

    // Tema: el de los ajustes cifrados mientras está abierto; el último conocido al estar bloqueado.
    effect(() => {
      const unlocked = this.store.state() === 'unlocked';
      let theme = unlocked ? this.store.settings().theme : null;
      try {
        if (theme) localStorage.setItem('km.theme', theme);
        else theme = (localStorage.getItem('km.theme') as typeof theme) ?? 'dark';
      } catch {
        theme ??= 'dark';
      }
      document.documentElement.dataset['theme'] = theme ?? 'dark';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5eee3' : '#120f0d');
    });
  }
}
