import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface PreviewUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  currentPosition: string;
  locationCountry: string;
}

@Injectable({ providedIn: 'root' })
export class AdminPreviewService {
  private readonly selectedUserSubject = new BehaviorSubject<PreviewUser | null>(null);
  readonly selectedUser$ = this.selectedUserSubject.asObservable();

  get selectedUser(): PreviewUser | null {
    return this.selectedUserSubject.value;
  }

  get isPreviewing(): boolean {
    return this.selectedUser !== null;
  }

  startPreview(user: PreviewUser): void {
    this.selectedUserSubject.next(user);
  }

  stopPreview(): void {
    this.selectedUserSubject.next(null);
  }
}
