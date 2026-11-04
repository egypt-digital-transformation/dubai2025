import { Component, HostListener, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { IconicProject } from './models/project.model';
import { AdminService } from '../services/admin.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-iconic-projects',
  standalone: true,
  templateUrl: './iconic-projects.page.html',
  styleUrls: ['./iconic-projects.page.scss'],
  imports: [CommonModule, IonContent],
})
export class IconicProjectsPage implements OnDestroy {
  private readonly adminService = inject(AdminService);
  private projectsSubscription?: Subscription;
  egyptProjects: IconicProject[] = [];
  ameaProjects: IconicProject[] = [];
  isLoading = true;
  errorMessage = '';
  selectedImage: { url: string; urls: string[]; index: number; title: string } | null = null;
  activeSlideByProjectId: Record<string, number> = {};

  ionViewWillEnter(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.projectsSubscription?.unsubscribe();
    this.projectsSubscription = this.adminService.watchProjects().subscribe({
      next: (projects) => {
        const byOrder = (a: IconicProject, b: IconicProject) =>
          (a.order > 0 ? a.order : Number.MAX_SAFE_INTEGER) - (b.order > 0 ? b.order : Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name);
        this.egyptProjects = projects.filter((project) => project.region === 'egypt').sort(byOrder);
        this.ameaProjects = projects.filter((project) => project.region === 'amea').sort(byOrder);
        this.isLoading = false;
        this.errorMessage = '';
      },
      error: (error: unknown) => {
        console.error('[IconicProjectsPage] Failed to watch projects:', error);
        this.isLoading = false;
        this.errorMessage = 'Projects are temporarily unavailable. Please try again later.';
      },
    });
  }

  ionViewWillLeave(): void {
    this.projectsSubscription?.unsubscribe();
    this.projectsSubscription = undefined;
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
  }

  getProjectImages(project: IconicProject): string[] {
    const primary = (project.heroImage || project.assetUrl || '').trim();
    const list = Array.isArray(project.images) ? project.images : [];
    const urls = Array.from(
      new Set([primary, ...list].map((url) => (url || '').trim()).filter(Boolean))
    );
    return urls.length ? urls : [''];
  }

  getActiveSlideIndex(project: IconicProject): number {
    return this.activeSlideByProjectId[project.id] ?? 0;
  }

  onProjectGalleryScroll(event: Event, project: IconicProject): void {
    const container = event.target as HTMLElement | null;
    if (!container || !container.clientWidth) {
      return;
    }
    const index = Math.round(container.scrollLeft / container.clientWidth);
    const total = this.getProjectImages(project).length;
    this.activeSlideByProjectId[project.id] = Math.max(0, Math.min(total - 1, index));
  }

  onImageError(event: Event) {
    const image = event.target;
    if (image instanceof HTMLImageElement) {
      image.hidden = true;
    }
  }

  openProjectAsset(project: IconicProject, imageIndex?: number): void {
    const images = this.getProjectImages(project).filter(Boolean);
    const assetUrl = (project.assetType === 'model' ? project.assetUrl : images[0]) || project.assetUrl || project.heroImage;
    if (!assetUrl) {
      return;
    }

    if (project.assetType === 'model') {
      window.open(assetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const idx = imageIndex ?? this.getActiveSlideIndex(project);
    const safeIdx = Math.max(0, Math.min(images.length - 1, idx));
    this.selectedImage = {
      url: images[safeIdx] || assetUrl,
      urls: images.length ? images : [assetUrl],
      index: safeIdx,
      title: project.title || project.name,
    };
  }

  selectViewerImage(index: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.selectedImage) {
      return;
    }
    const total = this.selectedImage.urls.length;
    const nextIndex = (index + total) % total;
    this.selectedImage = {
      ...this.selectedImage,
      index: nextIndex,
      url: this.selectedImage.urls[nextIndex],
    };
  }

  closeProjectAsset(): void {
    this.selectedImage = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProjectAsset();
  }
}
