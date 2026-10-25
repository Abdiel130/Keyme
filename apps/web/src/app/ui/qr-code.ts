import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

@Component({
  selector: 'km-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (src()) { <img [src]="src()" [alt]="alt()" /> }`,
  styles: `:host { display: inline-block; padding: 12px; background: #fffaf2; border-radius: 16px; } img { display: block; width: 200px; height: 200px; image-rendering: pixelated; }`,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly alt = input('Código QR');
  protected readonly src = signal('');

  constructor() {
    effect(async () => {
      const v = this.value();
      const QR = await import('qrcode');
      this.src.set(await QR.toDataURL(v, { margin: 1, width: 400, color: { dark: '#1e1309', light: '#fffaf2' }, errorCorrectionLevel: 'M' }));
    });
  }
}
