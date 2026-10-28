import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SsoPage } from '../../src/app/sso/sso.page';

describe('SsoPage', () => {
  let component: SsoPage;
  let fixture: ComponentFixture<SsoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SsoPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the team credit in the welcome screen footer', () => {
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('.sso-footer');
    expect(footer?.textContent).toContain('Powered by Holcim Egypt Digital Team');
  });
});
