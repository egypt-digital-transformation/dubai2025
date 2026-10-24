import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VenuePage } from '../../src/app/venue/venue.page';

describe('VenuePage', () => {
  let component: VenuePage;
  let fixture: ComponentFixture<VenuePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(VenuePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
