import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatSidenav } from '@angular/material/sidenav';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { AdvisorLayoutComponent } from '../advisor-layout/advisor-layout.component';
import { AuthenticatedLayoutComponent } from './authenticated-layout.component';

@Component({ template: '<button type="button">Contenido</button>' })
class RoutedContent {}

describe.each([
  { role: 'client', component: AuthenticatedLayoutComponent, target: '#main-content' },
  { role: 'advisor', component: AdvisorLayoutComponent, target: '#advisor-main-content' },
])('$role shell', ({ component, target }) => {
  async function setup() {
    const breakpoint = new BehaviorSubject({ matches: false, breakpoints: {} });
    TestBed.configureTestingModule({
      imports: [
        component,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([{ path: 'next-view', component: RoutedContent }]),
        { provide: AuthService, useValue: { user: signal(TEST_USER) } },
        { provide: PartnerContextService, useValue: { context: signal(null) } },
        { provide: BreakpointObserver, useValue: { observe: () => breakpoint } },
      ],
    });
    const fixture = TestBed.createComponent<AuthenticatedLayoutComponent | AdvisorLayoutComponent>(
      component,
    );
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const drawerElement = fixture.debugElement.query(By.directive(MatSidenav));
    const drawer: MatSidenav = drawerElement.componentInstance;
    return { fixture, drawer, drawerElement, breakpoint };
  }

  it('preserves the skip target and switches the public drawer API at the existing breakpoint', async () => {
    const { fixture, drawer, breakpoint } = await setup();
    expect(drawer.mode).toBe('side');
    expect(drawer.opened).toBe(true);
    expect(fixture.nativeElement.querySelector('.skip-link').getAttribute('href')).toBe(target);
    expect(fixture.nativeElement.querySelector(target).getAttribute('tabindex')).toBe('-1');

    breakpoint.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    expect(drawer.mode).toBe('over');
    expect(drawer.fixedInViewport).toBe(true);
    expect(drawer.opened).toBe(false);
    expect(fixture.nativeElement.querySelector('.menu-button')).not.toBeNull();
    fixture.destroy();
  });

  it('activates the semantic skip link without navigating and focuses the actual content', async () => {
    const { fixture } = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.skip-link');
    link.focus();
    const activation = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
    link.dispatchEvent(activation);
    expect(activation.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector(target));
    expect(navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it.each(['Escape', 'backdrop', 'close-button'])(
    'restores the mobile trigger after a real %s close even when opening transitions overlap',
    async (dismissal) => {
      const { fixture, drawer, drawerElement, breakpoint } = await setup();
      breakpoint.next({ matches: true, breakpoints: {} });
      await fixture.whenStable();
      const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-button');
      trigger.focus();
      trigger.click();
      await fixture.whenStable();
      expect(drawer.opened).toBe(true);

      // jsdom has no CSS transitions; reproduce overlapping completions through DOM events.
      drawerElement.nativeElement.focus();
      drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
      await fixture.whenStable();
      if (dismissal === 'Escape') {
        drawerElement.nativeElement.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
        );
      } else if (dismissal === 'backdrop') {
        fixture.nativeElement.querySelector('.mat-drawer-backdrop').click();
      } else {
        fixture.nativeElement.querySelector('.close-button').click();
      }
      drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
      await fixture.whenStable();
      expect(drawer.opened).toBe(false);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
      fixture.destroy();
    },
  );

  it('does not restore the mobile trigger over a newly focused route view', async () => {
    const { fixture, drawer, drawerElement, breakpoint } = await setup();
    breakpoint.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-button');
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    drawerElement.nativeElement.focus();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await fixture.whenStable();
    await TestBed.inject(Router).navigateByUrl('/next-view');
    const content: HTMLElement = fixture.nativeElement.querySelector(target);
    content.focus();
    const closing = drawer.close();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await closing;
    await fixture.whenStable();
    expect(document.activeElement).toBe(content);
    fixture.destroy();
  });

  it('cancels the pending return on navigation even if the new view leaves focus on body', async () => {
    const { fixture, drawer, drawerElement, breakpoint } = await setup();
    breakpoint.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.menu-button').click();
    await fixture.whenStable();
    drawerElement.nativeElement.focus();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await fixture.whenStable();
    await TestBed.inject(Router).navigateByUrl('/next-view');
    const content: HTMLElement = fixture.nativeElement.querySelector(target);
    content.focus();
    content.blur();
    const closing = drawer.close();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await closing;
    await fixture.whenStable();
    expect(document.activeElement).toBe(document.body);
    fixture.destroy();
  });

  it('does not return focus to a removed mobile trigger on a desktop disclosure', async () => {
    const { fixture, drawer, drawerElement, breakpoint } = await setup();
    breakpoint.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.menu-button').click();
    await fixture.whenStable();
    breakpoint.next({ matches: false, breakpoints: {} });
    await fixture.whenStable();
    const content: HTMLElement = fixture.nativeElement.querySelector(target);
    content.focus();
    const closing = drawer.close();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await closing;
    await fixture.whenStable();
    expect(document.activeElement).toBe(content);
    fixture.destroy();
  });

  it('does not invent a return target for a programmatic mobile opening', async () => {
    const { fixture, drawer, drawerElement, breakpoint } = await setup();
    breakpoint.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    const opening = drawer.open();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await opening;
    await fixture.whenStable();
    const content: HTMLElement = fixture.nativeElement.querySelector(target);
    content.focus();
    content.blur();
    const closing = drawer.close();
    drawerElement.nativeElement.dispatchEvent(new Event('transitionend'));
    await closing;
    await fixture.whenStable();
    expect(document.activeElement).toBe(document.body);
    fixture.destroy();
  });
});
