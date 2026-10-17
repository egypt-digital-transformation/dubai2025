import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { IconicProject } from './models/project.model';
import { EGYPT_PROJECTS, AMEA_PROJECTS } from './data/projects.data';

@Component({
  selector: 'app-iconic-projects',
  standalone: true,
  templateUrl: './iconic-projects.page.html',
  styleUrls: ['./iconic-projects.page.scss'],
  imports: [CommonModule, IonContent],
})
export class IconicProjectsPage {
  egyptProjects: IconicProject[] = EGYPT_PROJECTS;
  ameaProjects: IconicProject[] = AMEA_PROJECTS;

  onImageError(event: Event) {
    const image = event.target;
    if (image instanceof HTMLImageElement) {
      image.hidden = true;
    }
  }
}
