import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { TipsPage } from '../../src/app/tips/tips.page';

describe('TipsPage', () => {
  let component: TipsPage;
  let fixture: ComponentFixture<TipsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TipsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the event travel, attire, and safety guidance', () => {
    const guideText = fixture.nativeElement.textContent as string;

    expect(guideText).toContain('Airport and meeting transfers will be arranged by the organizers.');
    expect(guideText).toContain('Uber Comfort');
    expect(guideText).toContain('20–25°C');
    expect(guideText).toContain('PPE is not required');
    expect(guideText).toContain('Gala Dinner (Tuesday)');
    expect(guideText).toContain('15AMMS000002');
    expect(guideText).toContain('+33 1 55 63 29 15');
  });
});
