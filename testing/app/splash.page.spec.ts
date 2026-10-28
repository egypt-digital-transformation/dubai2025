import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { SplashPage } from '../../src/app/splash/splash.page';
import { AuthService } from '../../src/app/services/auth.service';

describe('SplashPage', () => {
  let component: SplashPage;
  let fixture: ComponentFixture<SplashPage>;
  let router: Router;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.overrideProvider(AuthService, {
      useValue: {
        currentUser: null,
        waitForAuthResolved: vi.fn().mockResolvedValue(undefined),
        isAuthenticated: vi.fn().mockReturnValue(false),
      },
    });
    fixture = TestBed.createComponent(SplashPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the splash brand and banner artwork', () => {
    fixture.detectChanges();

    const brand = fixture.nativeElement.querySelector('.brand-icon');
    const banner = fixture.nativeElement.querySelector('.banner-img');
    expect(brand?.getAttribute('src')).toBe('assets/logo-mark.png');
    expect(banner?.getAttribute('src')).toBe('assets/splashbanner.png');
  });

  it('should remain visible for 10 seconds before navigating', async () => {
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const initialization = component.ngOnInit();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(navigateByUrl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await initialization;
    expect(navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });
});
