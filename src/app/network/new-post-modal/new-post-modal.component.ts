import { Component, OnInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ActionSheetController, LoadingController, AlertController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Auth, User, onAuthStateChanged } from '@angular/fire/auth';
import { ImageUploadService } from '../../services/image-upload.service';
import { FirebaseInjectionContext } from '../../services/firebase-injection-context.service';

@Component({
  selector: 'app-new-post-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './new-post-modal.component.html',
  styleUrls: ['./new-post-modal.component.scss'],
})
export class NewPostModalComponent implements OnInit, OnDestroy {
  private auth = inject(Auth);
  private modalCtrl = inject(ModalController);
  private zone = inject(NgZone);
  private actionSheetCtrl = inject(ActionSheetController);
  private loadingCtrl = inject(LoadingController);
  private alertCtrl = inject(AlertController);
  private imageUploadService = inject(ImageUploadService);
  private firebaseContext = inject(FirebaseInjectionContext);
  private unsubscribeAuth?: () => void;

  userName = '';
  userPhoto = '';
  caption = '';
  selectedImageDataUrl?: string;
  uploadedImageUrl?: string;
  isLoading = false;
  imageLoadError = false;

  ngOnInit() {
    const currentUser = this.auth.currentUser;
    if (currentUser) {
      this.setUserData(currentUser);
    }

    this.unsubscribeAuth = this.firebaseContext.run(() =>
      onAuthStateChanged(this.auth, (user: User | null) => {
        this.zone.run(() => {
          if (user) {
            this.setUserData(user);
          } else {
            this.userName = 'Guest';
            this.userPhoto = 'assets/user.png';
          }
        });
      })
    );
  }

  ngOnDestroy() {
    if (this.unsubscribeAuth) this.unsubscribeAuth();
  }

  private setUserData(user: User) {
    this.userName = this.toTitleCase(user.displayName || 'Anonymous');
    let photoURL = user.photoURL || user.providerData[0]?.photoURL || 'assets/user.png';
    if (photoURL.includes('googleusercontent.com')) {
      photoURL = photoURL.replace(/=s\d+-c/, '=s400-c');
    }
    this.userPhoto = photoURL;
  }

  private toTitleCase(name: string): string {
    return name
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Show action sheet to choose image source
   * CRITICAL: Must run in NgZone for mobile
   */
  async selectImageSource() {
    console.log('[selectImageSource] Opening action sheet...');
    
    try {
      const actionSheet = await this.actionSheetCtrl.create({
        header: 'Add Photo',
        mode: 'ios', // iOS mode works better on all platforms
        buttons: [
          {
            text: 'Take Photo',
            icon: 'camera',
            handler: () => {
              console.log('[selectImageSource] Take Photo selected');
              // Use setTimeout to ensure action sheet dismisses first
              setTimeout(() => this.takePhoto(), 300);
              return true;
            },
          },
          {
            text: 'Choose from Gallery',
            icon: 'images',
            handler: () => {
              console.log('[selectImageSource] Gallery selected');
              setTimeout(() => this.pickFromGallery(), 300);
              return true;
            },
          },
          {
            text: 'Cancel',
            icon: 'close',
            role: 'cancel',
            handler: () => {
              console.log('[selectImageSource] Cancelled');
            }
          },
        ],
      });

      await actionSheet.present();
      console.log('[selectImageSource] Action sheet presented');
    } catch (error) {
      console.error('[selectImageSource] Error:', error);
      this.showAlert('Error', 'Failed to open photo picker');
    }
  }

  /**
   * Take photo with camera
   */
  async takePhoto() {
    console.log('[takePhoto] Starting...');
    
    try {
      const dataUrl = await this.imageUploadService.takePhoto();
      
      this.zone.run(() => {
        if (dataUrl) {
          console.log('[takePhoto] Photo captured, updating UI');
          this.selectedImageDataUrl = dataUrl;
        } else {
          console.warn('[takePhoto] No photo captured');
        }
      });
    } catch (error) {
      console.error('[takePhoto] Error:', error);
      this.zone.run(() => {
        this.showAlert('Error', 'Failed to take photo. Please try again.');
      });
    }
  }

  /**
   * Pick image from gallery
   */
  async pickFromGallery() {
    console.log('[pickFromGallery] Starting...');
    
    try {
      const dataUrl = await this.imageUploadService.pickImageFromGallery();
      
      this.zone.run(() => {
        if (dataUrl) {
          console.log('[pickFromGallery] Image selected, updating UI');
          this.selectedImageDataUrl = dataUrl;
        } else {
          console.warn('[pickFromGallery] No image selected');
        }
      });
    } catch (error) {
      console.error('[pickFromGallery] Error:', error);
      this.zone.run(() => {
        this.showAlert('Error', 'Failed to select image. Please try again.');
      });
    }
  }

  /**
   * Remove selected photo
   */
  removePhoto() {
    console.log('[removePhoto] Removing photo');
    this.selectedImageDataUrl = undefined;
    this.uploadedImageUrl = undefined;
  }

  /**
   * Create post and upload image
   */
  async createPost() {
    // Prevent double-submission
    if (this.isLoading) {
      console.log('[createPost] Already posting, ignoring');
      return;
    }

    console.log('[createPost] Starting...');
    
    if (!this.caption.trim() && !this.selectedImageDataUrl) {
      this.showAlert('Error', 'Please add a caption or photo');
      return;
    }

    this.isLoading = true;

    const loading = await this.loadingCtrl.create({
      message: 'Posting...',
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loading.present();

    try {
      let photoURL: string | undefined = undefined;
      const user = this.auth.currentUser;

      if (!user) {
        throw new Error('User not authenticated');
      }

      if (this.selectedImageDataUrl) {
        console.log('[createPost] Compressing image...');
        const compressedImage = await this.imageUploadService.compressImage(
          this.selectedImageDataUrl,
          1200,
          0.8
        );

        console.log('[createPost] Uploading image...');
        photoURL = await this.imageUploadService.uploadPostImage(
          compressedImage,
          user.uid
        );
      }

      console.log('[createPost] Dismissing modal with data');
      await loading.dismiss();

      await this.modalCtrl.dismiss(
        {
          caption: this.caption.trim(),
          photoURL: photoURL,
        },
        'post'
      );

    } catch (error) {
      await loading.dismiss();
      console.error('[createPost] Error:', error);
      this.isLoading = false;
      this.showAlert('Error', 'Failed to create post. Please try again.');
    }
  }

  /**
   * Close modal without posting
   */
  closeModal() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  /**
   * Handle avatar image load error
   */
  onImageError(event: any) {
    console.error('[onImageError] Avatar failed to load');
    this.imageLoadError = true;
    event.target.src = 'assets/user.png';
  }

  /**
   * Check if post button should be enabled
   */
  canPost(): boolean {
    return (this.caption.trim().length > 0 || !!this.selectedImageDataUrl) && !this.isLoading;
  }

  /**
   * Show alert dialog
   */
  private async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Handle file selection from web input
   */
  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showAlert('Error', 'Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showAlert('Error', 'Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.selectedImageDataUrl = e.target.result;
    };
    reader.readAsDataURL(file);
  }

}