import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PostService, Post } from '../services/post.service';
import { NewPostModalComponent } from './new-post-modal/new-post-modal.component';
import { Auth } from '@angular/fire/auth';
import { Timestamp } from 'firebase/firestore';

interface PostDisplay extends Post {
  liked: boolean;
  showComments?: boolean;
  newComment?: string;
  createdAt?: any;
}

@Component({
  selector: 'app-network',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './network.page.html',
  styleUrls: ['./network.page.scss'],
})
export class NetworkPage implements OnInit, OnDestroy {
  searchQuery = '';
  
  // Current user info from Google SSO
  currentUserId = '';
  currentUserName = '';
  currentUserPhoto = '';

  allPosts: PostDisplay[] = [];
  filteredPosts: PostDisplay[] = [];
  
  // Loading state for skeleton loader
  isLoading = true;
  private hasInitialLoad = false;
  
  private postsSubscription?: Subscription;
  private authCheckTimeout?: any;

  constructor(
    private modalCtrl: ModalController,
    private postService: PostService,
    private auth: Auth
  ) {}

  ngOnInit() {
    // Set a timeout to ensure skeleton shows for at least 500ms on mobile
    this.authCheckTimeout = setTimeout(() => {
      if (!this.hasInitialLoad) {
        console.log('Auth check timeout - stopping loader');
        this.isLoading = false;
      }
    }, 5000); // 5 second timeout

    // Get current user info from Google SSO
    this.auth.onAuthStateChanged((user) => {
      console.log('Auth state changed:', user ? 'User found' : 'No user');
      
      if (user) {
        this.currentUserId = user.uid;
        this.currentUserName = user.displayName || 'Anonymous';
        this.currentUserPhoto = user.photoURL || '';
        
        // Subscribe to real-time posts
        this.subscribeToPost();
      } else {
        console.log('No authenticated user');
        this.isLoading = false;
        this.hasInitialLoad = true;
        if (this.authCheckTimeout) {
          clearTimeout(this.authCheckTimeout);
        }
      }
    });
  }

  ngOnDestroy() {
    this.postsSubscription?.unsubscribe();
    if (this.authCheckTimeout) {
      clearTimeout(this.authCheckTimeout);
    }
  }

  /**
   * Subscribe to real-time posts from Firestore
   */
  private subscribeToPost() {
    console.log('Subscribing to posts...');
    this.isLoading = true;
    
    this.postsSubscription = this.postService.getPosts().subscribe({
      next: (posts) => {
        console.log('Posts received:', posts.length);
        
        // Transform posts to include UI state
        this.allPosts = posts.map((post) => ({
          ...post,
          liked: post.likes.includes(this.currentUserId),
          showComments: false,
          newComment: '',
        }));
        this.refreshFeed();
        
        // Mark as loaded and hide skeleton
        if (!this.hasInitialLoad) {
          this.hasInitialLoad = true;
          // Add small delay to ensure smooth transition on mobile
          setTimeout(() => {
            this.isLoading = false;
          }, 300);
        } else {
          this.isLoading = false;
        }

        // Clear timeout since we got data
        if (this.authCheckTimeout) {
          clearTimeout(this.authCheckTimeout);
        }
      },
      error: (error) => {
        console.error('Error fetching posts:', error);
        this.isLoading = false;
        this.hasInitialLoad = true;
        
        if (this.authCheckTimeout) {
          clearTimeout(this.authCheckTimeout);
        }
      },
    });
  }

  /**
   * Filter posts based on search query
   */
  onSearchChange(query: string) {
    if (!query.trim()) {
      this.filteredPosts = [...this.allPosts];
      return;
    }

    const lowerQuery = query.toLowerCase();
    this.filteredPosts = this.allPosts.filter(
      (p) =>
        p.caption.toLowerCase().includes(lowerQuery) ||
        p.userName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Open modal to create new post
   */
/**
 * Open modal to create new post
 */
async openNewPostModal() {
  const modal = await this.modalCtrl.create({
    component: NewPostModalComponent,
    cssClass: 'full-screen-modal',
    showBackdrop: true,
  });

  await modal.present();

  const { data, role } = await modal.onDidDismiss();
  console.log('[NetworkPage] Modal dismissed with role:', role, 'and data:', data);

  if (role === 'post' && data?.caption) {
    console.log('[NetworkPage] Creating Firestore post...');
    await this.createPost(data.caption, data.photoURL);
  } else {
    console.log('[NetworkPage] Modal closed without posting.');
  }
}


/**
   * Create a new post in Firestore
   */
async createPost(caption: string, photoURL?: string) {
  try {
    const tempId = 'temp-' + Date.now();

    // Temporary post shown immediately
    const tempPost: PostDisplay = {
      id: tempId,
      userId: this.currentUserId,
      userName: this.currentUserName,
      userPhoto: this.currentUserPhoto,
      caption,
      photoURL: photoURL || '',
      likes: [],
      comments: [],
      liked: false,
      showComments: false,
      newComment: '',
      createdAt: new Date(),
      timestamp: new Timestamp(Date.now() / 1000, 0),
    };

    // Show it instantly in the feed
    this.allPosts.unshift(tempPost);
    this.refreshFeed();

    // Upload to Firestore
    await this.postService.createPost({
      userId: this.currentUserId,
      userName: this.currentUserName,
      userPhoto: this.currentUserPhoto,
      caption,
      photoURL,
    });

    // Remove temporary post (Firestore real-time will re-add it properly)
    this.allPosts = this.allPosts.filter(p => p.id !== tempId);
    this.refreshFeed();

  } catch (error) {
    console.error('Error creating post:', error);
  }
}

  /**
   * Toggle like on a post
   */
  async toggleLike(post: PostDisplay) {
    if (!post.id) return;

    try {
      // Optimistic UI update
      post.liked = !post.liked;
      
      // Update in Firestore
      await this.postService.toggleLike(post.id, this.currentUserId, !post.liked);
      
      // The real-time listener will update the actual like count
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert optimistic update on error
      post.liked = !post.liked;
    }
  }

  /**
   * Toggle comments visibility
   */
  toggleComments(post: PostDisplay) {
    post.showComments = !post.showComments;
  }

  /**
   * Add a comment to a post
   */
  async addComment(post: PostDisplay) {
    if (!post.newComment?.trim() || !post.id) return;

    try {
      await this.postService.addComment(post.id, {
        userId: this.currentUserId,
        userName: this.currentUserName,
        userPhoto: this.currentUserPhoto,
        text: post.newComment,
      });

      // Clear input
      post.newComment = '';
      
      // Comment will automatically appear via real-time subscription
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  }

  /**
   * Get like count for display
   */
  getLikeCount(post: PostDisplay): number {
    return post.likes?.length || 0;
  }

  trackByPostId(index: number, post: PostDisplay): string {
  return post.id || index.toString();
}

  /**
   * Get comment count for display
   */
  getCommentCount(post: PostDisplay): number {
    return post.comments?.length || 0;
  }

  /**
   * Refresh and sort feed
   */
  private refreshFeed() {
    this.filteredPosts = [...this.allPosts];
  }

  /**
   * Manual refresh for pull-to-refresh (optional)
   */
  async doRefresh(event?: any) {
    try {
      // Re-subscribe will trigger fresh data
      this.subscribeToPost();
      
      if (event) {
        setTimeout(() => {
          event.target.complete();
        }, 1000);
      }
    } catch (error) {
      console.error('Error refreshing:', error);
      if (event) {
        event.target.complete();
      }
    }
  }
}
