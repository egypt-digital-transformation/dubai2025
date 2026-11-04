import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { inject } from '@angular/core';
import { AdminResource, AdminService, DEFAULT_RESOURCE_TYPES, ResourceType } from '../services/admin.service';
import { addIcons } from 'ionicons';
import { Subscription } from 'rxjs';
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
export class ResourcesPage implements OnDestroy {
  private readonly adminService = inject(AdminService);
  private resourcesSubscription?: Subscription;
  private resourceTypesSubscription?: Subscription;
  private configuredResourceTypes: ResourceType[] = [...DEFAULT_RESOURCE_TYPES];
  resourceFilters: ResourceFilter[] = ['All'];
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
  }

  ionViewWillEnter(): void {
    this.isLoading = true;
    this.resourcesSubscription?.unsubscribe();
    this.resourceTypesSubscription?.unsubscribe();
    this.resourcesSubscription = this.adminService.watchResources().subscribe({
      next: (resources) => {
        this.resources = resources;
        this.updateResourceFilters();
        this.isLoading = false;
      },
      error: (error: unknown) => {
        console.error('[ResourcesPage] Failed to watch resources:', error);
        this.isLoading = false;
      },
    });
    this.resourceTypesSubscription = this.adminService.watchResourceTypes().subscribe({
      next: (resourceTypes) => {
        this.configuredResourceTypes = resourceTypes;
        this.updateResourceFilters();
      },
      error: (error: unknown) => {
        console.error('[ResourcesPage] Failed to watch resource types:', error);
      },
    });
  }

  ionViewWillLeave(): void {
    this.resourcesSubscription?.unsubscribe();
    this.resourceTypesSubscription?.unsubscribe();
    this.resourcesSubscription = undefined;
    this.resourceTypesSubscription = undefined;
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
  }

  setFilter(filter: ResourceFilter): void {
    this.activeFilter = filter;
  }

  private updateResourceFilters(): void {
    const availableTypes = new Set(
      this.resources
        .map((resource) => resource.type?.trim())
        .filter((type): type is ResourceType => Boolean(type))
    );

    const orderedTypes = this.configuredResourceTypes.filter((type) =>
      availableTypes.has(type)
    );
    for (const type of availableTypes) {
      if (!orderedTypes.includes(type)) {
        orderedTypes.push(type);
      }
    }

    this.resourceFilters = ['All', ...orderedTypes];
    if (this.activeFilter !== 'All' && !availableTypes.has(this.activeFilter)) {
      this.activeFilter = 'All';
    }
  }

  get filteredResources(): AdminResource[] {
    const query = this.resourceSearch.trim().toLowerCase();
    return this.resources.filter((resource) => {
      const matchesType = this.activeFilter === 'All' || resource.type === this.activeFilter;
      const matchesSearch = !query ||
        [
          resource.title,
          resource.description,
          resource.type,
          resource.sessionName ?? '',
          resource.speakerName ?? '',
        ].some((value) => value.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }
}
