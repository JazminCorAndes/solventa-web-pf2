import { DOCUMENT } from '@angular/common';
import { contentChild, Directive, ElementRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSidenav } from '@angular/material/sidenav';
import { NavigationStart, Router } from '@angular/router';

@Directive({
  selector: '[appShellKeyboard]',
  exportAs: 'shellKeyboard',
})
export class ShellKeyboardDirective {
  readonly handset = input.required<boolean>({ alias: 'appShellKeyboard' });
  private readonly drawer = contentChild.required(MatSidenav);
  private readonly drawerElement = contentChild.required<MatSidenav, ElementRef<HTMLElement>>(
    MatSidenav,
    {
      read: ElementRef,
    },
  );
  private readonly trigger = contentChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private returnFocusTo: HTMLButtonElement | null = null;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) this.returnFocusTo = null;
    });
  }

  skipToContent(event: Event, content: HTMLElement): void {
    event.preventDefault();
    content.focus();
  }

  toggleMenu(): void {
    if (!this.handset() || this.drawer().mode !== 'over') return;
    if (!this.drawer().opened) {
      // Capture before Material's transition events can move focus into the drawer.
      this.returnFocusTo = this.trigger()?.nativeElement ?? null;
    }
    void this.drawer().toggle();
  }

  closeForNavigation(): void {
    this.returnFocusTo = null;
    if (this.handset()) void this.drawer().close();
  }

  onMenuClosed(): void {
    const trigger = this.returnFocusTo;
    this.returnFocusTo = null;
    const active = this.document.activeElement;
    if (
      trigger?.isConnected &&
      !trigger.disabled &&
      this.handset() &&
      this.drawer().mode === 'over' &&
      trigger === this.trigger()?.nativeElement &&
      (active === this.document.body || this.drawerElement().nativeElement.contains(active))
    ) {
      trigger.focus({ preventScroll: true });
    }
  }
}
