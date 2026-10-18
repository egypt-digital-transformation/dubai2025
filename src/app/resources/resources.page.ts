import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { inject } from '@angular/core';
import { AdminResource, AdminService, DEFAULT_RESOURCE_TYPES, ResourceType } from '../services/admin.service';
import { addIcons } from 'ionicons';
import {
  closeCircleOutline,
  folderOpenOutline,
  searchOutline,
} from 'ionicons/icons';

type ResourceFilter = 'All' | ResourceType;

@Component({
  selector: 'app-resources',
  standalone: true,
  templateUrl: 'resources.page.html',
  styleUrls: ['resources.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ResourcesPage {
  private readonly adminService = inject(AdminService);
  resourceFilters: ResourceFilter[] = ['All', ...DEFAULT_RESOURCE_TYPES];
  activeFilter: ResourceFilter = 'All';
  resourceSearch = '';
  resources: AdminResource[] = [];
  isLoading = true;

  constructor() {
    addIcons({
      closeCircleOutline,
      folderOpenOutline,
      searchOutline,
    });
    void this.loadResources();
  }

  async loadResources(): Promise<void> {
    try {
      const [resources, resourceTypes] = await Promise.all([
        this.adminService.loadResources(),
        this.adminService.loadResourceTypes(),
      ]);
      this.resources = resources;
      this.resourceFilters = ['All', ...resourceTypes];
    } catch (error) {
      console.error('[ResourcesPage] Failed to load resources:', error);
    } finally {
      this.isLoading = false;
    }
  }

  setFilter(filter: ResourceFilter): void {
    this.activeFilter = filter;
  }

  get filteredResources(): AdminResource[] {
    const query = this.resourceSearch.trim().toLowerCase();
    return this.resources.filter((resource) => {
      const matchesType = this.activeFilter === 'All' || resource.type === this.activeFilter;
      const matchesSearch = !query ||
        [resource.title, resource.description, resource.type].some((value) =>
          value.toLowerCase().includes(query)
        );
      return matchesType && matchesSearch;
    });
  }
}
