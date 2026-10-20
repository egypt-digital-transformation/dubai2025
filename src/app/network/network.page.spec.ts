import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { vi } from 'vitest';

import { NetworkPage } from './network.page';

describe('NetworkPage', () => {
  let component: NetworkPage;
  let fixture: ComponentFixture<NetworkPage>;

  beforeEach(async () => {
    TestBed.overrideComponent(NetworkPage, {
      set: { providers: [{ provide: ModalController, useValue: { create: vi.fn() } }] },
    });
    fixture = TestBed.createComponent(NetworkPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
