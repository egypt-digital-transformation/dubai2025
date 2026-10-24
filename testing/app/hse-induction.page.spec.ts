import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HseInductionPage } from '../../src/app/hse-induction/hse-induction.page';

describe('HseInductionPage', () => {
  let component: HseInductionPage;
  let fixture: ComponentFixture<HseInductionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HseInductionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
