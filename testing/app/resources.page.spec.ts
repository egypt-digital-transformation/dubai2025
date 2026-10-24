import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourcesPage } from '../../src/app/resources/resources.page';

describe('ResourcesPage', () => {
  let component: ResourcesPage;
  let fixture: ComponentFixture<ResourcesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ResourcesPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
