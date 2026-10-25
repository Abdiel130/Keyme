import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { InstallPrompt } from '../core/install';
import { Icon } from './icon';

/**
 * "Instalar app": usa el diálogo nativo cuando el navegador lo ofrece y, si no,
 * muestra cómo instalarla a mano. Se oculta cuando ya corre como app.
 */
@Component({
  selector: 'km-install-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (installer.available()) {
      <button type="button" class="btn" [class.sm]="compact()" [class.block]="!compact()" (click)="install()">
        <km-icon name="download" [size]="compact() ? 15 : 16" /> Instalar app
      </button>
      @if (help()) {
        <div class="help panel" role="note">
          @if (installer.platform() === 'ios') {
            En Safari toca <b>Compartir</b> <km-icon name="upload" [size]="13" /> y luego <b>Agregar a pantalla de inicio</b>.
          } @else {
            Abre el menú del navegador <km-icon name="more" [size]="13" /> y elige <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.
            En Firefox de escritorio no se puede instalar: usa Chrome o Edge.
          }
          <button type="button" class="btn icon sm ghost close" (click)="help.set(false)" aria-label="Cerrar"><km-icon name="x" [size]="14" /></button>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .help { position: relative; margin-top: 8px; padding: 10px 34px 10px 12px; font-size: 13px; line-height: 1.5; color: var(--text-2); }
    .help km-icon { vertical-align: -2px; }
    .close { position: absolute; top: 6px; right: 6px; }
  `,
})
export class InstallButton {
  protected installer = inject(InstallPrompt);
  readonly compact = input(false);
  protected readonly help = signal(false);

  protected async install(): Promise<void> {
    if (!(await this.installer.install())) this.help.update((v) => !v);
  }
}
