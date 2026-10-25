import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
  countdown?: number;
  action?: { label: string; run: () => void };
}

@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly items = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, tone: Toast['tone'] = 'ok', extra: Partial<Pick<Toast, 'countdown' | 'action'>> = {}): void {
    const id = ++this.seq;
    this.items.update((l) => [...l.slice(-2), { id, text, tone, ...extra }]);
    setTimeout(() => this.dismiss(id), extra.action ? 6000 : 2600);
  }

  dismiss(id: number): void {
    this.items.update((l) => l.filter((t) => t.id !== id));
  }
}
