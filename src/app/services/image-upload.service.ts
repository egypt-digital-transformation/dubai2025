import { Injectable } from '@angular/core';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';
import {
  Storage,
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from '@angular/fire/storage';
import { getApps, initializeApp } from 'firebase/app';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private readonly hseApp =
    getApps().find((app) => app.name === 'HSEApp') ??
    initializeApp(environment.hsefirebaseConfig, 'HSEApp');
  private readonly hseAuth = getAuth(this.hseApp);
  private readonly storage: Storage = getStorage(
    this.hseApp,
    `gs://${environment.hsefirebaseConfig.storageBucket}`
  );

  /**
   * Pick image from device (web-based file input)
   * @param acceptCamera Whether to allow camera capture on mobile browsers
   */
  async pickImage(acceptCamera: boolean = true): Promise<string | null> {
    return new Promise((resolve, reject) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        // Enable camera on mobile browsers - use setAttribute for better compatibility
        if (acceptCamera) {
          input.setAttribute('capture', 'environment');
        }

        // Timeout to detect if user cancels
        let resolved = false;

        input.onchange = (event: any) => {
          resolved = true;
          const file = event.target.files?.[0];
          
          if (!file) {
            console.log('[pickImage] No file selected');
            resolve(null);
            return;
          }

          if (!file.type.startsWith('image/')) {
            console.error('[pickImage] Invalid file type:', file.type);
            resolve(null);
            return;
          }

          if (file.size > 10 * 1024 * 1024) {
            console.error('[pickImage] File too large:', file.size);
            resolve(null);
            return;
          }

          console.log('[pickImage] File selected:', file.name, file.size);

          const reader = new FileReader();
          reader.onload = (e: any) => {
            console.log('[pickImage] File read successfully');
            resolve(e.target.result);
          };
          reader.onerror = (error) => {
            console.error('[pickImage] FileReader error:', error);
            resolve(null);
          };
          reader.readAsDataURL(file);
        };

        // Handle cancel/close without selection
        input.oncancel = () => {
          resolved = true;
          console.log('[pickImage] User cancelled');
          resolve(null);
        };

        // Fallback for browsers that don't support oncancel
        const checkCancelled = () => {
          setTimeout(() => {
            if (!resolved) {
              console.log('[pickImage] Input appears to have been cancelled');
              resolve(null);
            }
          }, 100);
        };

        // Add event listener for window focus (user closed file picker)
        window.addEventListener('focus', checkCancelled, { once: true });

        console.log('[pickImage] Opening file picker...');
        input.click();

        // Clean up if input is removed from DOM
        setTimeout(() => {
          if (!resolved) {
            console.log('[pickImage] Timeout - no selection made');
            resolve(null);
          }
        }, 60000); // 60 second timeout

      } catch (error) {
        console.error('[pickImage] Error:', error);
        reject(error);
      }
    });
  }

  /**
   * Pick image from gallery (web file picker)
   */
  async pickImageFromGallery(): Promise<string | null> {
    console.log('[pickImageFromGallery] Starting...');
    return this.pickImage(false);
  }

  /**
   * Take photo with camera (mobile browser camera)
   */
  async takePhoto(): Promise<string | null> {
    console.log('[takePhoto] Starting...');
    return this.pickImage(true);
  }

  /**
   * Upload image to Firebase Storage
   * @param dataUrl Base64 data URL from file input
   * @param userEmail Ahlan email used to authenticate with the HSE project
   * @returns Download URL of uploaded image
   */
  async preparePostUpload(userEmail: string): Promise<void> {
    await this.authenticateHseUser(userEmail);
  }

  async uploadPostImage(dataUrl: string, userEmail: string): Promise<string> {
    try {
      const hseUser = await this.authenticateHseUser(userEmail);
      console.log('[uploadPostImage] Starting upload for HSE user:', hseUser.uid);
      
      // Convert data URL to blob
      const blob = this.dataUrlToBlob(dataUrl);
      console.log('[uploadPostImage] Blob created, size:', blob.size);
      
      // Create unique filename with timestamp
      const timestamp = Date.now();
      const fileName = `posts/${hseUser.uid}/${timestamp}.jpg`;
      
      // Create storage reference
      const storageRef = ref(this.storage, fileName);
      
      // Upload file
      console.log('[uploadPostImage] Uploading to:', fileName);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg'
      });
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('[uploadPostImage] Success! URL:', downloadURL);
      
      return downloadURL;
    } catch (error) {
      console.error('[uploadPostImage] Error:', error);
      throw new Error('Failed to upload image: ' + (error as Error).message);
    }
  }

  /**
   * Delete image from Firebase Storage
   * @param imageUrl Full download URL of the image
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      console.log('[deleteImage] Deleting:', imageUrl);
      
      // Extract path from URL
      const path = this.getPathFromUrl(imageUrl);
      if (!path) {
        console.warn('[deleteImage] Could not extract path from URL');
        return;
      }

      const storageRef = ref(this.storage, path);
      await deleteObject(storageRef);
      console.log('[deleteImage] Successfully deleted:', path);
    } catch (error) {
      console.error('[deleteImage] Error:', error);
      throw error;
    }
  }

  async deletePostImage(imageUrl: string, userEmail: string): Promise<void> {
    const hseUser = await this.authenticateHseUser(userEmail);
    const path = this.getPathFromUrl(imageUrl);
    if (!path) {
      throw new Error('Could not identify the photo in HSE Storage.');
    }

    const [collectionName, ownerId] = path.split('/');
    if (collectionName !== 'posts' || ownerId !== hseUser.uid) {
      throw new Error('You can only delete photos you uploaded.');
    }

    await deleteObject(ref(this.storage, path));
  }

  private async authenticateHseUser(userEmail: string) {
    const expectedEmail = userEmail.trim().toLowerCase();
    if (!expectedEmail) {
      throw new Error('Sign in to Ahlan before sharing a photo.');
    }

    const currentUser = this.hseAuth.currentUser;
    if (currentUser?.email?.trim().toLowerCase() === expectedEmail) {
      return currentUser;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
      login_hint: expectedEmail,
    });

    const credential = await signInWithPopup(this.hseAuth, provider);
    if (credential.user.email?.trim().toLowerCase() !== expectedEmail) {
      await signOut(this.hseAuth);
      throw new Error('Sign in to HSE with the same Google account you use for Ahlan.');
    }

    return credential.user;
  }

  /**
   * Convert data URL to Blob
   */
  private dataUrlToBlob(dataUrl: string): Blob {
    try {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      return new Blob([u8arr], { type: mime });
    } catch (error) {
      console.error('[dataUrlToBlob] Error converting data URL:', error);
      throw new Error('Failed to convert image data');
    }
  }

  /**
   * Extract storage path from download URL
   */
  private getPathFromUrl(url: string): string | null {
    try {
      const decodedUrl = decodeURIComponent(url);
      const match = decodedUrl.match(/\/o\/(.+?)\?/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('[getPathFromUrl] Error:', error);
      return null;
    }
  }

  /**
   * Compress image before upload (for better performance)
   */
  async compressImage(dataUrl: string, maxWidth = 1200, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('[compressImage] Starting compression...');
      
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          console.log('[compressImage] Original size:', width, 'x', height);

          // Calculate new dimensions
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          console.log('[compressImage] New size:', width, 'x', height);

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          
          console.log('[compressImage] Compression complete');
          resolve(compressed);
        } catch (error) {
          console.error('[compressImage] Error:', error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('[compressImage] Image load error:', error);
        reject(new Error('Failed to load image for compression'));
      };
      
      img.src = dataUrl;
    });
  }
}