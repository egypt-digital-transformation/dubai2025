import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { IconicProject } from './models/project.model';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-iconic-projects',
  standalone: true,
  templateUrl: './iconic-projects.page.html',
  styleUrls: ['./iconic-projects.page.scss'],
  imports: [CommonModule, IonContent],
})
export class IconicProjectsPage {
  private readonly adminService = inject(AdminService);
  egyptProjects: IconicProject[] = [];
  ameaProjects: IconicProject[] = [];
  isLoading = true;
  errorMessage = '';
  selectedImage: { url: string; title: string } | null = null;

  constructor() {
    void this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    try {
      const projects = await this.adminService.loadProjects();
      this.egyptProjects = projects.filter((project) => project.region === 'egypt');
      this.ameaProjects = projects.filter((project) => project.region === 'amea');
    } catch (error) {
      console.error('[IconicProjectsPage] Failed to load projects:', error);
      this.errorMessage = 'Projects are temporarily unavailable. Please try again later.';
    } finally {
      this.isLoading = false;
    }
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
