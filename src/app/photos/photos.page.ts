import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Auth, onAuthStateChanged, Unsubscribe, User } from '@angular/fire/auth';
import {
  DocumentData,
  QueryDocumentSnapshot,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chatbubbleOutline,
  closeOutline,
  heart,
  heartOutline,
  imagesOutline,
  refreshOutline,
  send,
  trashOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';
import { ImageUploadService } from '../services/image-upload.service';
import { Comment, Post, PostService } from '../services/post.service';

export interface ResolvedLikeUser {
  userId: string;
  name: string;
  photoURL?: string;
  isMe?: boolean;
}

const MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024;
const FEED_PAGE_SIZE = 10;
const USER_PROFILES_CACHE_KEY = 'timeline_user_profiles_cache_v1';

@Component({
  selector: 'app-photos',
  standalone: true,
  templateUrl: './photos.page.html',
  styleUrls: ['./photos.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class PhotosPage implements OnInit, OnDestroy {
  @ViewChild('commentsScrollArea') private commentsScrollArea?: ElementRef<HTMLDivElement>;

  private readonly auth = inject(Auth);
  private readonly zone = inject(NgZone);
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly postService = inject(PostService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private authUnsubscribe?: Unsubscribe;
  private currentUser?: User;
  private cursor?: QueryDocumentSnapshot<DocumentData>;
  private activePostSubscription?: Subscription;
  private userProfilesCache = new Map<string, { name: string; photoURL?: string }>();

  posts: Post[] = [];
  caption = '';
  selectedPhoto?: string;
  isLoading = true;
  isLoadingMore = false;
  isPosting = false;
  deletingPostId = '';
  hasMore = false;
  hasAgreedToGuidance = false;
  showComposerModal = false;
  errorMessage = '';
  uploadError = '';
  currentUserId = '';

  // Likes modal state
  showLikesModal = false;
  activeLikesPost?: Post;
  resolvedLikesUsers: ResolvedLikeUser[] = [];
  isLoadingLikesUsers = false;
  togglingLikePostId = '';

  // Comments modal state
  showCommentsModal = false;
  activeCommentsPost?: Post;
  newCommentText = '';
  isSubmittingComment = false;
  commentError = '';

  constructor() {
    addIcons({
      addOutline,
      chatbubbleOutline,
      closeOutline,
      heart,
      heartOutline,
      imagesOutline,
      refreshOutline,
      send,
      trashOutline,
    });
    this.loadCachedProfilesFromStorage();
  }

  ngOnInit(): void {
    this.authUnsubscribe = this.firebaseContext.run(() =>
      onAuthStateChanged(this.auth, (user) => {
        this.zone.run(() => {
          this.currentUser = user ?? undefined;
          this.currentUserId = user?.uid ?? '';
          if (user) {
            void this.loadFeed(true);
          } else {
            this.posts = [];
            this.isLoading = false;
            this.errorMessage = 'Please sign in to view the photo feed.';
          }
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.activePostSubscription?.unsubscribe();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.uploadError = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.uploadError = 'Choose an image file to continue.';
      return;
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      this.uploadError = 'Choose a photo smaller than 20 MB.';
      return;
    }

    try {
      this.selectedPhoto = await this.readFileAsDataUrl(file);
    } catch (error) {
      console.error('[PhotosPage] Could not read selected photo:', error);
      this.uploadError = 'Could not open that photo. Please choose another one.';
    }
  }

  clearSelectedPhoto(): void {
    this.selectedPhoto = undefined;
    this.uploadError = '';
  }

  openComposerModal(): void {
    this.uploadError = '';
    this.showComposerModal = true;
  }

  closeComposerModal(): void {
    if (!this.isPosting) {
      this.showComposerModal = false;
    }
  }

  async loadFeed(reset = false): Promise<void> {
    if (this.isLoadingMore || (!reset && !this.hasMore)) return;
    if (reset) {
      this.isLoading = true;
      this.errorMessage = '';
      this.posts = [];
      this.cursor = undefined;
    } else {
      this.isLoadingMore = true;
      this.errorMessage = '';
    }

    try {
      const page = await this.postService.getPostsPage(
        this.cursor,
        FEED_PAGE_SIZE
      );
      this.zone.run(() => {
        this.posts = reset ? page.posts : [...this.posts, ...page.posts];
        this.cursor = page.cursor;
        this.hasMore = page.hasMore;
        this.cacheUserProfilesFromPosts(page.posts);
      });
    } catch (error) {
      console.error('[PhotosPage] Failed to load the photo feed:', error);
      this.zone.run(() => {
        this.errorMessage =
          'Could not load photos. Check your connection and try again.';
      });
    } finally {
      this.zone.run(() => {
        this.isLoading = false;
        this.isLoadingMore = false;
      });
    }
  }

  async createPost(): Promise<void> {
    const user = this.currentUser;
    const photoDataUrl = this.selectedPhoto;
    if (!user || !photoDataUrl || !this.hasAgreedToGuidance || this.isPosting) {
      return;
    }
    if (!user.email) {
      this.uploadError = 'Your signed-in account does not have an email address.';
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.uploadError = 'You need an internet connection to share a photo.';
      return;
    }

    this.isPosting = true;
    this.uploadError = '';
    let uploadedPhotoUrl: string | undefined;
    try {
      await this.imageUpload.preparePostUpload(user.email);
      const compressedPhoto = await this.imageUpload.compressImage(
        photoDataUrl,
        1600,
        0.78
      );
      uploadedPhotoUrl = await this.imageUpload.uploadPostImage(
        compressedPhoto,
        user.email
      );

      const userName =
        user.displayName?.trim() ||
        user.email?.split('@')[0] ||
        'Attendee';
      await this.postService.createPost({
        userId: user.uid,
        userName,
        userPhoto: user.photoURL ?? '',
        caption: this.caption.trim(),
        photoURL: uploadedPhotoUrl,
      });

      this.caption = '';
      this.selectedPhoto = undefined;
      this.hasAgreedToGuidance = false;
      this.showComposerModal = false;
      await this.loadFeed(true);
    } catch (error) {
      console.error('[PhotosPage] Failed to publish photo:', error);
      if (uploadedPhotoUrl) {
        try {
          await this.imageUpload.deleteImage(uploadedPhotoUrl);
        } catch (cleanupError) {
          console.error(
            '[PhotosPage] Failed to clean up an unpublished photo:',
            cleanupError
          );
        }
      }
      this.uploadError = 'Could not share your photo. Please try again.';
    } finally {
      this.isPosting = false;
    }
  }

  async confirmDeletePost(post: Post): Promise<void> {
    if (
      !post.id ||
      post.userId !== this.currentUser?.uid ||
      this.deletingPostId
    ) {
      return;
    }

    const confirmation = await this.alertController.create({
      header: 'Delete this photo?',
      message: 'This will permanently remove your photo from the feed.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void this.deletePost(post);
          },
        },
      ],
    });
    await confirmation.present();
  }

  private async deletePost(post: Post): Promise<void> {
    const user = this.currentUser;
    if (!post.id || post.userId !== user?.uid || this.deletingPostId) {
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await this.showDeleteError(
        'Connect to the internet before deleting a photo.'
      );
      return;
    }

    this.deletingPostId = post.id;
    try {
      if (post.photoURL) {
        if (!user.email) {
          throw new Error('Your signed-in account does not have an email address.');
        }
        await this.imageUpload.deletePostImage(post.photoURL, user.email);
      }
      await this.postService.deletePost(post.id);
      this.posts = this.posts.filter((item) => item.id !== post.id);
    } catch (error) {
      console.error('[PhotosPage] Failed to delete photo post:', error);
      await this.showDeleteError(
        'Could not delete the photo. Check your connection and HSE Storage permissions, then try again.'
      );
    } finally {
      this.deletingPostId = '';
    }
  }

  private async showDeleteError(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Photo not deleted',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  postDate(post: Post): Date | null {
    return post.timestamp?.toDate?.() ?? null;
  }

  commentDate(comment: Comment): Date | null {
    if (!comment) return null;
    if (comment.timestamp && typeof comment.timestamp.toDate === 'function') {
      return comment.timestamp.toDate();
    }
    if (comment.timestamp instanceof Date) {
      return comment.timestamp;
    }
    if (typeof comment.timestamp === 'string' || typeof comment.timestamp === 'number') {
      const d = new Date(comment.timestamp);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  isPostLikedByMe(post: Post): boolean {
    return !!(this.currentUserId && post.likes?.includes(this.currentUserId));
  }

  async toggleLike(post: Post): Promise<void> {
    if (!this.currentUser || !post.id || this.togglingLikePostId === post.id) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await this.showToast('You need an internet connection to like a photo.');
      return;
    }

    const userId = this.currentUserId;
    const isLiked = Array.isArray(post.likes) ? post.likes.includes(userId) : false;
    this.togglingLikePostId = post.id;

    // Cache current user profile
    this.cacheUserProfile(
      userId,
      this.currentUser.displayName?.trim() || this.currentUser.email?.split('@')[0] || 'Attendee',
      this.currentUser.photoURL ?? ''
    );

    // Optimistic update
    const previousLikes = [...(post.likes || [])];
    if (isLiked) {
      post.likes = previousLikes.filter((id) => id !== userId);
    } else {
      post.likes = [...previousLikes, userId];
    }

    if (this.showLikesModal && this.activeLikesPost?.id === post.id) {
      this.resolveLikesUsers(post);
    }

    try {
      await this.postService.toggleLike(post.id, userId, isLiked);
    } catch (error) {
      console.error('[PhotosPage] Failed to toggle like:', error);
      // Revert optimistic update
      post.likes = previousLikes;
      if (this.showLikesModal && this.activeLikesPost?.id === post.id) {
        this.resolveLikesUsers(post);
      }
      await this.showToast('Could not update like. Please try again.');
    } finally {
      this.togglingLikePostId = '';
    }
  }

  openLikesModal(post: Post): void {
    this.activeLikesPost = post;
    this.showLikesModal = true;
    this.resolveLikesUsers(post);
  }

  closeLikesModal(): void {
    this.showLikesModal = false;
    this.activeLikesPost = undefined;
    this.resolvedLikesUsers = [];
    this.isLoadingLikesUsers = false;
  }

  private resolveLikesUsers(post: Post): void {
    const userIds = Array.isArray(post.likes) ? post.likes : [];
    if (!userIds.length) {
      this.resolvedLikesUsers = [];
      this.isLoadingLikesUsers = false;
      return;
    }

    const currentUid = this.currentUserId;
    const list: ResolvedLikeUser[] = [];
    const missingUids: string[] = [];

    for (const uid of userIds) {
      if (uid === currentUid && this.currentUser) {
        list.push({
          userId: uid,
          name: this.currentUser.displayName?.trim() || this.currentUser.email?.split('@')[0] || 'You',
          photoURL: this.currentUser.photoURL ?? undefined,
          isMe: true,
        });
      } else if (this.userProfilesCache.has(uid)) {
        const cached = this.userProfilesCache.get(uid)!;
        list.push({
          userId: uid,
          name: cached.name,
          photoURL: cached.photoURL,
          isMe: false,
        });
      } else {
        missingUids.push(uid);
        list.push({
          userId: uid,
          name: 'Attendee',
          photoURL: undefined,
          isMe: false,
        });
      }
    }

    // Place current user first, then sort alphabetically
    this.resolvedLikesUsers = list.sort((a, b) => {
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      return a.name.localeCompare(b.name);
    });

    if (missingUids.length) {
      void this.fetchMissingProfiles(missingUids);
    }
  }

  private async fetchMissingProfiles(uids: string[]): Promise<void> {
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const fn = httpsCallable<{ uids: string[] }, { profiles: Record<string, { name: string; photoURL: string }> }>(
        functions,
        'getUserProfilesByUids'
      );
      const res = await fn({ uids });
      if (res?.data?.profiles) {
        let updated = false;
        for (const [uid, profile] of Object.entries(res.data.profiles)) {
          if (profile?.name) {
            this.cacheUserProfile(uid, profile.name, profile.photoURL);
            updated = true;
          }
        }
        if (updated && this.activeLikesPost) {
          this.resolveLikesUsers(this.activeLikesPost);
        }
      }
    } catch {
      // Gracefully ignored if backend function is unavailable
    }
  }

  openCommentsModal(post: Post): void {
    this.activeCommentsPost = post;
    this.newCommentText = '';
    this.commentError = '';
    this.showCommentsModal = true;

    // Real-time listener while comments modal is active
    this.activePostSubscription?.unsubscribe();
    if (post.id) {
      this.activePostSubscription = this.postService.watchPost(post.id).subscribe({
        next: (updatedPost) => {
          if (!updatedPost) return;
          this.zone.run(() => {
            this.activeCommentsPost = updatedPost;
            const idx = this.posts.findIndex((p) => p.id === updatedPost.id);
            if (idx !== -1) {
              this.posts[idx] = updatedPost;
            }
            this.cacheUserProfilesFromPosts([updatedPost]);
          });
        },
        error: (err) => console.warn('[PhotosPage] watchPost error:', err),
      });
    }

    setTimeout(() => this.scrollCommentsToBottom(), 120);
  }

  closeCommentsModal(): void {
    this.showCommentsModal = false;
    this.activePostSubscription?.unsubscribe();
    this.activePostSubscription = undefined;
    this.activeCommentsPost = undefined;
    this.newCommentText = '';
    this.commentError = '';
  }

  onCommentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.submitComment();
    }
  }

  async submitComment(): Promise<void> {
    const post = this.activeCommentsPost;
    const user = this.currentUser;
    const text = this.newCommentText.trim();
    if (!post?.id || !user || !text || this.isSubmittingComment) return;

    if (text.length > 2000) {
      this.commentError = 'Comment must be 2000 characters or fewer.';
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.commentError = 'You need an internet connection to write a comment.';
      return;
    }

    this.isSubmittingComment = true;
    this.commentError = '';

    const commentData = {
      userId: user.uid,
      userName: user.displayName?.trim() || user.email?.split('@')[0] || 'Attendee',
      userPhoto: user.photoURL ?? '',
      text,
    };

    try {
      const addedComment = await this.postService.addComment(post.id, commentData);
      this.cacheUserProfile(user.uid, commentData.userName, commentData.userPhoto);

      if (!post.comments) {
        post.comments = [];
      }
      post.comments.push(addedComment);

      this.newCommentText = '';
      setTimeout(() => this.scrollCommentsToBottom(), 80);
    } catch (error) {
      console.error('[PhotosPage] Failed to add comment:', error);
      this.commentError = 'Could not post your comment. Please try again.';
    } finally {
      this.isSubmittingComment = false;
    }
  }

  private scrollCommentsToBottom(): void {
    const el = this.commentsScrollArea?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  private cacheUserProfilesFromPosts(posts: Post[]): void {
    for (const p of posts) {
      if (p.userId && p.userName) {
        this.cacheUserProfile(p.userId, p.userName, p.userPhoto);
      }
      if (Array.isArray(p.comments)) {
        for (const c of p.comments) {
          if (c.userId && c.userName) {
            this.cacheUserProfile(c.userId, c.userName, c.userPhoto);
          }
        }
      }
    }
  }

  private cacheUserProfile(userId: string, name: string, photoURL?: string): void {
    if (!userId || !name || name === 'Attendee') return;
    this.userProfilesCache.set(userId, { name, photoURL: photoURL || undefined });
    this.persistCachedProfiles();
  }

  private loadCachedProfilesFromStorage(): void {
    try {
      const raw = localStorage.getItem(USER_PROFILES_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { name: string; photoURL?: string }>;
        for (const [k, v] of Object.entries(parsed)) {
          if (v?.name) this.userProfilesCache.set(k, v);
        }
      }
    } catch {
      // Storage unavailable or invalid
    }
  }

  private persistCachedProfiles(): void {
    try {
      const obj: Record<string, { name: string; photoURL?: string }> = {};
      this.userProfilesCache.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(USER_PROFILES_CACHE_KEY, JSON.stringify(obj));
    } catch {
      // Storage quota or error
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Selected photo could not be read as an image.'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Photo read failed.'));
      reader.readAsDataURL(file);
    });
  }
}
