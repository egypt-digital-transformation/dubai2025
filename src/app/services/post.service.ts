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
  DocumentData,
  QueryDocumentSnapshot,
  getDocs,
  limit,
  startAfter,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Comment {
  userId?: string;
  userName: string;
  userPhoto?: string;
  text: string;
  timestamp?: Timestamp | any;
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

export interface PostPage {
  posts: Post[];
  cursor?: QueryDocumentSnapshot<DocumentData>;
  hasMore: boolean;
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

  async getPostsPage(
    cursor?: QueryDocumentSnapshot<DocumentData>,
    pageSize = 10
  ): Promise<PostPage> {
    const postsCollection = collection(this.firestore, 'posts');
    const constraints = [
      orderBy('timestamp', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ];
    const snapshot = await getDocs(query(postsCollection, ...constraints));
    const posts = snapshot.docs.map((postDoc) => {
      const data = postDoc.data() as Omit<Post, 'id'>;
      return {
        id: postDoc.id,
        ...data,
        likes: Array.isArray(data.likes) ? data.likes : [],
        comments: Array.isArray(data.comments) ? data.comments : [],
      };
    });

    return {
      posts,
      cursor: snapshot.docs[snapshot.docs.length - 1],
      hasMore: snapshot.docs.length === pageSize,
    };
  }

  watchPost(postId: string): Observable<Post | null> {
    return new Observable((observer) => {
      const postRef = doc(this.firestore, 'posts', postId);
      const unsubscribe = onSnapshot(
        postRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            observer.next(null);
            return;
          }
          const data = snapshot.data() as Omit<Post, 'id'>;
          observer.next({
            id: snapshot.id,
            ...data,
            likes: Array.isArray(data.likes) ? data.likes : [],
            comments: Array.isArray(data.comments) ? data.comments : [],
          });
        },
        (error) => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  async deletePost(postId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'posts', postId));
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
  ): Promise<Comment> {
    const postRef = doc(this.firestore, 'posts', postId);
    const newComment: Comment = {
      userId: comment.userId,
      userName: comment.userName,
      userPhoto: comment.userPhoto || '',
      text: comment.text.trim(),
      timestamp: Timestamp.now(),
    };
    
    await updateDoc(postRef, {
      comments: arrayUnion(newComment),
    });

    return newComment;
  }
}