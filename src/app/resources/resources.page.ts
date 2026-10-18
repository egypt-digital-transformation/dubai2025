import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeCircleOutline,
  folderOpenOutline,
  searchOutline,
} from 'ionicons/icons';

type ResourceFilter = 'All' | 'Presentation' | 'Video' | 'Document' | 'Photo';

@Component({
  selector: 'app-resources',
  standalone: true,
  templateUrl: 'resources.page.html',
  styleUrls: ['resources.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ResourcesPage {
  readonly resourceFilters: ResourceFilter[] = [
    'All',
    'Presentation',
    'Video',
    'Document',
    'Photo',
  ];
  activeFilter: ResourceFilter = 'All';
  resourceSearch = '';

  constructor() {
    addIcons({
      closeCircleOutline,
      folderOpenOutline,
      searchOutline,
    });
  }

  setFilter(filter: ResourceFilter): void {
    this.activeFilter = filter;
  }
}
