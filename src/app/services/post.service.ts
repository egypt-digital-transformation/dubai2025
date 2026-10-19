import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Comment {
  userName: string;
  userPhoto?: string;
  text: string;
  timestamp: Timestamp;
}

export interface Post {
  id?: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  caption: string;
  photoURL?: string;
  likes: string[]; // Array of user IDs who liked
  comments: Comment[];
  timestamp: Timestamp;
}

@Injectable({
  providedIn: 'root',
})
export class PostService {
  constructor(private firestore: Firestore) {}

  /**
   * Create a new post
   */
  async createPost(postData: {
    userId: string;
    userName: string;
    userPhoto?: string;
    caption: string;
    photoURL?: string;
  }): Promise<void> {
    const postsCollection = collection(this.firestore, 'posts');
    
    await addDoc(postsCollection, {
      userId: postData.userId,
      userName: postData.userName,
      userPhoto: postData.userPhoto || '',
      caption: postData.caption,
      photoURL: postData.photoURL || '',
      likes: [],
      comments: [],
      timestamp: serverTimestamp(),
    });
  }

  /**
   * Get real-time posts feed
   */
  getPosts(): Observable<Post[]> {
    return new Observable((observer) => {
      const postsCollection = collection(this.firestore, 'posts');
      const q = query(postsCollection, orderBy('timestamp', 'desc'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const posts: Post[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<Post, 'id'>),
          }));
          observer.next(posts);
        },
        (error) => {
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Toggle like on a post
   */
  async toggleLike(postId: string, userId: string, isLiked: boolean): Promise<void> {
    const postRef = doc(this.firestore, 'posts', postId);
    
    await updateDoc(postRef, {
      likes: isLiked ? arrayRemove(userId) : arrayUnion(userId),
    });
  }

  /**
   * Add a comment to a post
   */
  async addComment(
    postId: string,
    comment: {
      userId: string;
      userName: string;
      userPhoto?: string;
      text: string;
    }
  ): Promise<void> {
    const postRef = doc(this.firestore, 'posts', postId);
    
    await updateDoc(postRef, {
      comments: arrayUnion({
        userId: comment.userId,
        userName: comment.userName,
        userPhoto: comment.userPhoto || '',
        text: comment.text,
        timestamp: serverTimestamp(),
      }),
    });
  }
}