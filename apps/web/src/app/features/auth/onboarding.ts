import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../../core/api';
import { downloadEmergencyKit } from '../../core/emergency-kit';
import { generatePassphrase } from '../../core/generator';
import { strength } from '../../core/strength';
import { VaultStore, defaultDeviceName } from '../../core/vault.store';
import { Icon } from '../../ui/icon';
import { StrengthMeter } from '../../ui/strength-meter';
import { VaultDial } from '../../ui/vault-dial';

type Step = 'welcome' | 'token' | 'password' | 'creating' | 'kit';

@Component({
  selector: 'km-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, StrengthMeter, VaultDial],
  templateUrl: './onboarding.html',
  styleUrl: './auth.scss',
})
export class Onboarding {
  private store = inject(VaultStore);

  protected readonly step = signal<Step>('welcome');
  protected readonly steps: Step[] = ['welcome', 'token', 'password', 'kit'];
  protected readonly stepIndex = computed(() => Math.max(0, this.steps.indexOf(this.step() === 'creating' ? 'password' : this.step())));

  protected token = '';
  protected deviceName = defaultDeviceName();
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly show = signal(false);
  protected readonly accepted = signal(false);
  protected readonly error = signal('');
  protected readonly kitDownloaded = signal(false);

  protected readonly score = computed(() => strength(this.password()).score);
  protected readonly canCreate = computed(
    () => this.password().length >= 10 && this.score() >= 3 && this.password() === this.confirm() && this.accepted(),
  );

  protected next(step: Step): void {
    this.error.set('');
    this.step.set(step);
  }

  protected suggest(): void {
    const p = generatePassphrase({ words: 5, separator: '-', capitalize: false, number: true });
    this.password.set(p);
    this.confirm.set('');
    this.show.set(true);
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) return;
    this.step.set('creating');
    this.error.set('');
    try {
      // La pantalla del kit se muestra sobre el vault ya desbloqueado.
      this.store.onboarding.set(true);
      await this.store.create(this.token, this.password(), this.deviceName.trim() || defaultDeviceName());
      this.step.set('kit');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      this.error.set(
        code === 'bad_setup_token' ? 'El token de instalación no coincide. Cópialo de la salida de ./up.sh --setup.'
          : code === 'already_initialized' ? 'Este servidor ya tiene un vault. Recarga para desbloquearlo.'
          : code === 'throttled' ? 'Demasiados intentos. Espera un minuto.'
          : e instanceof ApiError && e.offline ? 'No hay conexión con el servidor.'
          : 'No se pudo crear el vault.',
      );
      this.store.onboarding.set(false);
      this.step.set(code === 'bad_setup_token' ? 'token' : 'password');
    }
  }

  protected async kit(): Promise<void> {
    await downloadEmergencyKit(this.deviceName);
    this.kitDownloaded.set(true);
  }

  protected finish(): void {
    this.password.set('');
    this.confirm.set('');
    this.store.onboarding.set(false);
  }
}
