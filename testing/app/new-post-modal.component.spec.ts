import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import {
  ActionSheetController,
  AlertController,
  LoadingController,
  ModalController,
} from '@ionic/angular';
import { ImageUploadService } from '../../src/app/services/image-upload.service';
import { NewPostModalComponent } from '../../src/app/network/new-post-modal/new-post-modal.component';

describe('NewPostModalComponent', () => {
  let component: NewPostModalComponent;
  let fixture: ComponentFixture<NewPostModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.overrideComponent(NewPostModalComponent, {
      set: {
        providers: [
          { provide: ActionSheetController, useValue: {} },
          { provide: AlertController, useValue: {} },
          { provide: LoadingController, useValue: {} },
          { provide: ModalController, useValue: {} },
          { provide: ImageUploadService, useValue: {} },
        ],
      },
    });
    TestBed.configureTestingModule({
      imports: [NewPostModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NewPostModalComponent);
    component = fixture.componentInstance;
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
