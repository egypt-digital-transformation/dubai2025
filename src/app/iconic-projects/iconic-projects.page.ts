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
  selectedImage: { url: string; title: string } | null = null;

  ionViewWillEnter(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.projectsSubscription?.unsubscribe();
    this.projectsSubscription = this.adminService.watchProjects().subscribe({
      next: (projects) => {
        this.egyptProjects = projects.filter((project) => project.region === 'egypt');
        this.ameaProjects = projects.filter((project) => project.region === 'amea');
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

  onImageError(event: Event) {
    const image = event.target;
    if (image instanceof HTMLImageElement) {
      image.hidden = true;
    }
  }

  openProjectAsset(project: IconicProject): void {
    const assetUrl = project.assetUrl || project.heroImage;
    if (!assetUrl) {
      return;
    }

    if (project.assetType === 'model') {
      window.open(assetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    this.selectedImage = {
      url: assetUrl,
      title: project.title || project.name,
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
