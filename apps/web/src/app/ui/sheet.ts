import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';

/**
 * Bottom sheet on phones, centered window on desktop. It animates in and out,
 * and on phones it follows the finger when dragged down: past a third of its
 * height, or with a quick flick, it closes; otherwise it springs back.
 * Close it from projected content with a template ref: `#sh` + `sh.close()`.
 */
@Component({
  selector: 'km-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet-scrim" #scrim [class.closing]="closing()" [class.morphed]="morphed" (click)="close()">
      <div class="sheet" #panel [class]="panelClass()" [class.still]="still()" [class.morphed]="morphed" [style.width]="width()"
           [attr.role]="role()" [attr.aria-label]="label()" aria-modal="true"
           (click)="$event.stopPropagation()"
           (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)">
        <ng-content />
      </div>
    </div>
  `,
  host: { '(document:keydown.escape)': 'close()' },
})
export class Sheet {
  readonly label = input('');
  readonly role = input('dialog');
  readonly panelClass = input('');
  readonly width = input<string | null>(null);
  /** Fires once the closing animation ends; the parent removes the sheet then. */
  readonly dismissed = output<void>();

  protected readonly closing = signal(false);
  /**
   * Opened through a morph (the + button grows into the sheet): the View
   * Transition already animated the entrance, so the CSS one must not replay
   * once the transition class is gone.
   */
  protected readonly morphed = document.documentElement.classList.contains('vt-local');
  /** Whole sheet can be dragged (its content does not scroll). */
  protected readonly still = signal(false);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly scrim = viewChild.required<ElementRef<HTMLElement>>('scrim');

  private drag: { id: number; y: number; x: number; t: number; on: boolean; dy: number } | null = null;
  private dragged = false;

  constructor() {
    afterNextRender(() => {
      const p = this.panel().nativeElement;
      p.addEventListener('click', (e) => this.swallow(e), true);
      this.still.set(p.scrollHeight <= p.clientHeight + 1);
    });
  }

  private get phone(): boolean {
    return matchMedia('(max-width: 860px)').matches;
  }

  /** Plays the exit animation, then emits `dismissed`. */
  close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    const p = this.panel().nativeElement;
    if (reducedMotion()) {
      this.dismissed.emit();
      return;
    }
    // Apply the closing state now so the exit animation can be awaited.
    this.scrim().nativeElement.classList.add('closing');
    // A dragged sheet leaves from where the finger dropped it.
    if (p.style.transform) {
      p.style.transition = 'transform .24s cubic-bezier(.3,0,.8,.15)';
      getComputedStyle(p).transform;
      p.style.transform = 'translateY(100%)';
    }
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      this.dismissed.emit();
    };
    void Promise.all(p.getAnimations().map((a) => a.finished)).then(end, end);
    setTimeout(end, 1500);
  }

  protected down(e: PointerEvent): void {
    if (!this.phone || e.button !== 0 || this.closing()) return;
    const p = this.panel().nativeElement;
    const top = e.clientY - p.getBoundingClientRect().top;
    const zone = this.still() || top < 56 || !!(e.target as HTMLElement).closest('.sheet-head');
    if (!zone || p.scrollTop > 0) return;
    this.drag = { id: e.pointerId, y: e.clientY, x: e.clientX, t: e.timeStamp, on: false, dy: 0 };
  }

  protected move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    const p = this.panel().nativeElement;
    if (!d.on) {
      if (Math.abs(e.clientX - d.x) > 10 && Math.abs(e.clientX - d.x) > Math.abs(dy)) return void (this.drag = null);
      if (dy < -8) return void (this.drag = null);
      if (dy < 8) return;
      d.on = true;
      d.y = e.clientY;
      p.setPointerCapture(e.pointerId);
      p.style.animation = 'none';
      p.style.transition = 'none';
      p.style.userSelect = 'none';
      getSelection()?.removeAllRanges();
      return;
    }
    // Down follows the finger 1:1; up resists like a rubber band.
    d.dy = dy > 0 ? dy : -Math.pow(-dy, 0.7);
    p.style.transform = `translateY(${d.dy}px)`;
    const k = Math.max(0, 1 - d.dy / p.offsetHeight);
    this.scrim().nativeElement.style.setProperty('--k', String(k));
  }

  protected up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!d.on) return;
    this.dragged = true;
    const p = this.panel().nativeElement;
    const speed = d.dy / Math.max(1, e.timeStamp - d.t);
    if (e.type === 'pointerup' && (d.dy > p.offsetHeight / 3 || (speed > 0.5 && d.dy > 24))) {
      this.close();
      return;
    }
    p.style.transition = 'transform .5s cubic-bezier(.34,1.3,.64,1)';
    p.style.transform = '';
    this.scrim().nativeElement.style.removeProperty('--k');
  }

  /** A drag must not end as a tap on whatever was under the finger. */
  private swallow(e: Event): void {
    if (!this.dragged) return;
    this.dragged = false;
    e.stopPropagation();
    e.preventDefault();
  }
}
