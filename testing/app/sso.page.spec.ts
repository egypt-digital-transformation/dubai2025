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
});
