import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowBackOutline,
  airplaneOutline,
  chevronDownOutline,
  closeOutline,
  createOutline,
  downloadOutline,
  folderOpenOutline,
  gridOutline,
  notificationsOutline,
  peopleOutline,
  refreshOutline,
  trashOutline,
  sendOutline,
  statsChartOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { interval } from 'rxjs';
import { Router } from '@angular/router';
import {
  AdminAttendee,
  AdminCampaign,
  AdminDashboard,
  AdminInteractiveActivity,
  AdminRequest,
  AdminResource,
  AdminService,
  DEFAULT_RESOURCE_TYPES,
  NotificationSendResult,
  NotificationTarget,
  ResourceType,
  RequestStatus,
} from '../services/admin.service';
import { IconicProject } from '../iconic-projects/models/project.model';
import type { ProjectInput } from '../services/admin.service';
import { ALL_PROJECTS } from '../iconic-projects/data/projects.data';
import countryData from '../../../node_modules/flag-icons/country.json';
import { greetingForNationality, NationalityGreeting } from '../shared/nationality-greetings';
import { egyptDateTimeToIso, formatEgyptDateTime } from './notification-schedule-time';

type SegmentField =
  | 'day2.group'
  | 'day3.type'
  | 'day3.groupAM'
  | 'day3.groupPM'
  | 'participantsGroup'
  | 'plantVisit';
type AudienceKind = 'all' | 'users' | 'group' | 'plantVisitors';
type AudienceContext = 'update' | 'activity';

interface AudienceSegment {
  key: string;
  field: SegmentField;
  value: string;
  label: string;
}

type AdminSection = 'overview' | 'attendees' | 'flights' | 'requests' | 'engagement' | 'projects' | 'resources' | 'updates';
type UpdateMode = 'now' | 'scheduled';
type AttendeeStatusFilter = 'all' | 'active' | 'loggedIn' | 'installed' | 'pushReady';
interface ProjectCountry {
  name: string;
  code: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  imports: [CommonModule, DatePipe, FormsModule, IonicModule],
})
export class AdminPage implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);

  dashboard: AdminDashboard | null = null;
  notificationAudience: AdminAttendee[] | null = null;
  notificationAudienceError = '';
  isLoading = true;
  isSending = false;
  errorMessage = '';
  noticeMessage = '';
  audienceKind: AudienceKind = 'all';
  selectedUserIds: string[] = [];
  notificationUserSearch = '';
  selectedSegmentKey = '';
  notificationTitle = '';
  notificationBody = '';
  scheduledDateTime = '';
  segments: AudienceSegment[] = [];
  activityKind: 'quiz' | 'poll' = 'quiz';
  activityTitle = '';
  activityQuestion = '';
  activityOptions = ['', ''];
  correctOptionIndex = 0;
  activityAudienceKind: AudienceKind = 'all';
  activitySelectedUserIds: string[] = [];
  activityUserSearch = '';
  activitySelectedSegmentKey = '';
  isCreatingActivity = false;
  activityNotice = '';
  activityError = '';
  showActivityResults: Record<string, boolean> = {};
  adminActivities: AdminInteractiveActivity[] = [];
  requests: AdminRequest[] = [];
  requestStatusOptions: RequestStatus[] = ['Open', 'In progress', 'Resolved'];
  savingRequestId: string | null = null;
  requestLoadError = '';
  activityLoadError = '';
  formControlsError = '';
  selectedSection: AdminSection = 'overview';
  updateMode: UpdateMode = 'now';
  attendeeSearch = '';
  attendeeStatusFilter: AttendeeStatusFilter = 'all';
  projects: IconicProject[] = [];
  projectLoadError = '';
  projectNotice = '';
  projectError = '';
  isLoadingProjects = false;
  isSavingProject = false;
  isDeletingProject = false;
  editingProjectId: string | null = null;
  isProjectFormOpen = false;
  selectedProjectFile: File | null = null;
  projectForm = this.emptyProjectForm();
  readonly projectCountries: ProjectCountry[] = countryData
    .filter((country) => country.iso)
    .map((country) => ({ name: country.name, code: country.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  filteredProjectCountries = this.projectCountries;
  isCountryPickerOpen = false;
  countrySearch = '';
  resources: AdminResource[] = [];
  resourceLoadError = '';
  resourceNotice = '';
  resourceError = '';
  isLoadingResources = false;
  isSavingResource = false;
  isDeletingResource = false;
  editingResourceId: string | null = null;
  isResourceFormOpen = false;
  selectedResourceFile: File | null = null;
  resourceForm = this.emptyResourceForm();
  resourceTypes: ResourceType[] = [...DEFAULT_RESOURCE_TYPES];
  newResourceType = '';
  isSavingResourceType = false;

  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor() {
    addIcons({
      addOutline,
      arrowBackOutline,
      airplaneOutline,
      chevronDownOutline,
      closeOutline,
      createOutline,
      downloadOutline,
      folderOpenOutline,
      gridOutline,
      notificationsOutline,
      peopleOutline,
      refreshOutline,
      trashOutline,
      sendOutline,
      statsChartOutline,
      cloudUploadOutline,
    });
  }

  returnToApp(): void {
    void this.router.navigateByUrl('/tabs/home');
  }

  selectSection(section: AdminSection): void {
    this.selectedSection = section;
    if (section === 'projects' && !this.projects.length && !this.isLoadingProjects) {
      void this.loadProjects();
    }
    if (section === 'resources' && !this.resources.length && !this.isLoadingResources) {
      void this.loadResources();
    }
  }

  onSectionTabKeydown(event: KeyboardEvent, currentSection: AdminSection): void {
    const sections: AdminSection[] = ['overview', 'attendees', 'flights', 'requests', 'engagement', 'projects', 'resources', 'updates'];
    const currentIndex = sections.indexOf(currentSection);
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % sections.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + sections.length) % sections.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = sections.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextSection = sections[nextIndex];
    this.selectSection(nextSection);
    document.getElementById(`admin-tab-${nextSection}`)?.focus();
  }

  ngOnInit(): void {
    void this.registerFormControls().catch((error: unknown) => {
      console.error('[AdminPage] Failed to register admin form controls:', error);
      this.formControlsError = 'Admin forms could not be loaded. Reload the page and try again.';
    });
    void this.loadDashboard();
    void this.loadNotificationAudience();
    void this.loadAdminActivities();
    void this.loadRequests();
    this.refreshTimer = setInterval(() => {
      if (!this.isLoading && !this.isSending) {
        void this.loadDashboard(true);
        void this.loadNotificationAudience();
        void this.loadRequests();
      }
    }, 30_000);
  }

  private async registerFormControls(): Promise<void> {
    const [input, select, selectOption, textarea] = await Promise.all([
      import('@ionic/core/components/ion-input.js'),
      import('@ionic/core/components/ion-select.js'),
      import('@ionic/core/components/ion-select-option.js'),
      import('@ionic/core/components/ion-textarea.js'),
    ]);
    input.defineCustomElement();
    select.defineCustomElement();
    selectOption.defineCustomElement();
    textarea.defineCustomElement();
  }

  ionViewDidEnter(): void {
    document.getElementById('admin-title')?.focus();
  }

  async loadRequests(): Promise<void> {
    try {
      this.requests = await this.adminService.loadAdminRequests();
      this.requestLoadError = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load requests:', error);
      this.requestLoadError = 'Could not load help requests.';
    }
  }

  async updateRequest(request: AdminRequest): Promise<void> {
    if (this.savingRequestId) {
      return;
    }

    this.savingRequestId = request.id;
    try {
      await this.adminService.updateAdminRequest(
        request.id,
        request.status,
        request.adminComment
      );
      this.noticeMessage = 'Request updated successfully.';
      await this.loadRequests();
    } catch (error) {
      console.error('[AdminPage] Failed to update request:', error);
      this.requestLoadError = 'Could not save this request update.';
    } finally {
      this.savingRequestId = null;
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  async loadDashboard(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }

    try {
      this.dashboard = await this.adminService.loadDashboard();
      this.errorMessage = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load dashboard:', error);
      this.errorMessage =
        'Could not load the admin dashboard. Check your connection and admin access, then try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async loadNotificationAudience(): Promise<void> {
    this.notificationAudienceError = '';
    try {
      this.notificationAudience = await this.adminService.loadNotificationAudience();
      this.segments = this.buildSegments(this.notificationAudience);
      if (
        this.selectedSegmentKey &&
        !this.segments.some((segment) => segment.key === this.selectedSegmentKey)
      ) {
        this.selectedSegmentKey = '';
      }
      if (
        this.selectedUserIds.length &&
        !this.selectedUserIds.every((userId) =>
          this.notificationAudience?.some((attendee) => attendee.id === userId)
        )
      ) {
        this.selectedUserIds = this.selectedUserIds.filter((userId) =>
          this.notificationAudience?.some((attendee) => attendee.id === userId)
        );
      }
      this.activitySelectedUserIds = this.activitySelectedUserIds.filter((userId) =>
        this.notificationAudience?.some((attendee) => attendee.id === userId)
      );
      if (
        this.activitySelectedSegmentKey &&
        !this.notificationSegments.some(
          (segment) => segment.key === this.activitySelectedSegmentKey
        )
      ) {
        this.activitySelectedSegmentKey = '';
      }
    } catch (error) {
      console.error('[AdminPage] Failed to load notification audience from Firestore:', error);
      this.notificationAudienceError =
        'Could not load users and groups from Firestore. Refresh and try again.';
    }
  }

  async loadProjects(): Promise<void> {
    this.isLoadingProjects = true;
    this.projectLoadError = '';
    try {
      this.projects = await this.adminService.loadProjects();
    } catch (error) {
      console.error('[AdminPage] Failed to load projects:', error);
      this.projectLoadError = 'Could not load projects. Check your connection and try again.';
    } finally {
      this.isLoadingProjects = false;
    }

  }

  async loadResources(): Promise<void> {
    this.isLoadingResources = true;
    this.resourceLoadError = '';
    try {
      const [resources, resourceTypes] = await Promise.all([
        this.adminService.loadResources(),
        this.adminService.loadResourceTypes(),
      ]);
      this.resources = resources;
      this.resourceTypes = resourceTypes;
    } catch (error) {
      console.error('[AdminPage] Failed to load resources:', error);
      this.resourceLoadError = 'Could not load resources. Check your connection and try again.';
    } finally {
      this.isLoadingResources = false;
    }
  }

  async addResourceType(): Promise<void> {
    const type = this.newResourceType.trim().replace(/\s+/g, ' ');
    if (!type) {
      this.resourceError = 'Enter a type name first.';
      return;
    }
    if (this.resourceTypes.some((existingType) => existingType.toLowerCase() === type.toLowerCase())) {
      this.resourceForm.type = this.resourceTypes.find(
        (existingType) => existingType.toLowerCase() === type.toLowerCase()
      ) ?? type;
      this.newResourceType = '';
      return;
    }
    this.isSavingResourceType = true;
    this.resourceError = '';
    try {
      const savedType = await this.adminService.saveResourceType(type);
      this.resourceTypes = [...this.resourceTypes, savedType].sort((a, b) => a.localeCompare(b));
      this.resourceForm.type = savedType;
      this.newResourceType = '';
    } catch (error) {
      console.error('[AdminPage] Failed to save resource type:', error);
      this.resourceError = 'Could not add this resource type. Please try again.';
    } finally {
      this.isSavingResourceType = false;
    }
  }

  startNewResource(): void {
    this.editingResourceId = null;
    this.isResourceFormOpen = true;
    this.resourceForm = this.emptyResourceForm();
    this.selectedResourceFile = null;
    this.resourceError = '';
  }

  editResource(resource: AdminResource): void {
    this.editingResourceId = resource.id;
    this.isResourceFormOpen = true;
    this.resourceForm = {
      title: resource.title,
      type: resource.type,
      description: resource.description,
      url: resource.url,
    };
    this.selectedResourceFile = null;
    this.resourceError = '';
  }

  cancelResourceEdit(): void {
    this.editingResourceId = null;
    this.isResourceFormOpen = false;
    this.selectedResourceFile = null;
    this.resourceError = '';
  }

  onResourceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedResourceFile = input.files?.[0] ?? null;
    if (this.selectedResourceFile) {
      this.resourceForm.url = '';
    }
  }

  async saveResource(): Promise<void> {
    const form = this.resourceForm;
    if (!form.title.trim() || !form.type) {
      this.resourceError = 'Title and type are required.';
      return;
    }
    if (!this.selectedResourceFile && !form.url.trim()) {
      this.resourceError = 'Provide an URL or upload a file.';
      return;
    }
    if (!this.selectedResourceFile && !/^https:\/\//i.test(form.url.trim())) {
      this.resourceError = 'Resource links must use HTTPS.';
      return;
    }
    this.isSavingResource = true;
    this.resourceError = '';
    try {
      const url = this.selectedResourceFile
        ? await this.adminService.uploadResource(this.selectedResourceFile, form.title.trim())
        : form.url.trim();
      const saved = await this.adminService.saveResource({
        id: this.editingResourceId ?? undefined,
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim(),
        url,
      });
      const index = this.resources.findIndex((resource) => resource.id === saved.id);
      this.resources = index < 0
        ? [...this.resources, saved]
        : this.resources.map((resource) => resource.id === saved.id ? saved : resource);
      this.resources.sort((a, b) => a.title.localeCompare(b.title));
      this.resourceNotice = `${saved.title} saved.`;
      this.cancelResourceEdit();
    } catch (error) {
      console.error('[AdminPage] Failed to save resource:', error);
      this.resourceError = 'Could not save this resource. Please try again.';
    } finally {
      this.isSavingResource = false;
    }
  }

  async removeResource(resource: AdminResource): Promise<void> {
    const confirmation = await this.alertController.create({
      header: 'Remove resource?',
      message: `Remove "${resource.title}" from the resource library?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'confirm', cssClass: 'danger-button' },
      ],
    });
    await confirmation.present();
    const { role } = await confirmation.onDidDismiss();
    if (role !== 'confirm') return;
    this.isDeletingResource = true;
    try {
      await this.adminService.deleteResource(resource.id);
      this.resources = this.resources.filter((item) => item.id !== resource.id);
      this.resourceNotice = `${resource.title} removed.`;
    } catch (error) {
      console.error('[AdminPage] Failed to remove resource:', error);
      this.resourceError = 'Could not remove this resource. Please try again.';
    } finally {
      this.isDeletingResource = false;
    }
  }

  private emptyResourceForm() {
    return { title: '', type: 'Presentation' as ResourceType, description: '', url: '' };
  }

  async importCurrentPortfolio(): Promise<void> {
    this.isSavingProject = true;
    this.projectError = '';
    try {
      const imported = await Promise.all(
        ALL_PROJECTS.map((project) => this.adminService.saveProject(project))
      );
      this.projects = imported.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      this.projectNotice = `${imported.length} projects imported. They can now be edited from this panel.`;
    } catch (error) {
      console.error('[AdminPage] Failed to import current portfolio:', error);
      this.projectError = 'Could not import the current portfolio. Please try again.';
    } finally {
      this.isSavingProject = false;
    }
  }

  startNewProject(): void {
    this.editingProjectId = null;
    this.isProjectFormOpen = true;
    this.projectForm = this.emptyProjectForm();
    this.selectedProjectFile = null;
    this.closeCountryPicker();
    this.projectError = '';
    this.projectNotice = '';
  }

  editProject(project: IconicProject): void {
    this.editingProjectId = project.id;
    this.isProjectFormOpen = true;
    this.projectForm = {
      title: project.title ?? project.name,
      location: project.location ?? project.subtitle,
      country: project.country || 'Egypt',
      assetType: project.assetType ?? 'image',
      assetUrl: project.assetUrl ?? project.heroImage,
      modelFormat: project.modelFormat ?? 'glb',
      description: project.description,
      highlights: project.highlights?.length
        ? [...project.highlights]
        : (project.engineeringHighlight ? [project.engineeringHighlight] : ['']),
    };
    this.selectedProjectFile = null;
    this.closeCountryPicker();
    this.projectError = '';
    this.projectNotice = '';
  }

  cancelProjectEdit(): void {
    this.editingProjectId = null;
    this.isProjectFormOpen = false;
    this.projectError = '';
    this.closeCountryPicker();
  }

  async saveProject(): Promise<void> {
    const form = this.projectForm;
    if (!form.title.trim() || !form.location.trim() || !form.country || !form.description.trim()) {
      this.projectError = 'Title, location, region, and description are required.';
      return;
    }
    if (form.assetType === 'image' && !this.selectedProjectFile && !form.assetUrl) {
      this.projectError = 'Upload an image before saving.';
      return;
    }
    if (form.assetType === 'model' && !this.selectedProjectFile && !form.assetUrl.trim()) {
      this.projectError = 'Provide a GLB/GLTF URL or upload a model before saving.';
      return;
    }
    this.isSavingProject = true;
    this.projectError = '';
    try {
      const assetUrl = this.selectedProjectFile
        ? await this.adminService.uploadProjectAsset(
          this.selectedProjectFile,
          form.assetType,
          form.title.trim()
        )
        : await this.adminService.ensureProjectAssetStored(
          form.assetUrl.trim(),
          form.assetType,
          form.title.trim()
        );
      const project: ProjectInput = {
        id: this.editingProjectId ?? undefined,
        title: form.title.trim(),
        location: form.location.trim(),
        name: form.title.trim(),
        subtitle: form.location.trim(),
        region: form.country === 'Egypt' ? 'egypt' : 'amea',
        country: form.country,
        countryCode: this.countryCode(form.country),
        coordinates: { lat: 0, lng: 0 },
        heroImage: form.assetType === 'image' ? assetUrl : '',
        assetType: form.assetType,
        assetUrl,
        description: form.description.trim(),
        engineeringHighlight: form.highlights.map((highlight) => highlight.trim()).filter(Boolean)[0] ?? '',
        highlights: form.highlights.map((highlight) => highlight.trim()).filter(Boolean),
        stats: {},
        products: [],
        tags: [],
        order: this.projects.length + 1,
      };
      if (form.assetType === 'model') {
        project.modelFormat = form.modelFormat;
      }
      const saved = await this.adminService.saveProject(project);
      const existingIndex = this.projects.findIndex((project) => project.id === saved.id);
      this.projects = existingIndex < 0
        ? [...this.projects, saved]
        : this.projects.map((project) => project.id === saved.id ? saved : project);
      this.projects.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      this.editingProjectId = null;
      this.isProjectFormOpen = false;
      this.selectedProjectFile = null;
      this.projectNotice = `${saved.name} saved.`;
    } catch (error) {
      console.error('[AdminPage] Failed to save project:', error);
      this.projectError = 'Could not save this project. Please try again.';
    } finally {
      this.isSavingProject = false;
    }
  }

  async removeProject(project: IconicProject): Promise<void> {
    const confirmation = await this.alertController.create({
      header: 'Remove project?',
      message: `Remove “${project.title || project.name}” from the attendee portfolio?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'confirm', cssClass: 'danger-button' },
      ],
    });
    await confirmation.present();
    const { role } = await confirmation.onDidDismiss();
    if (role !== 'confirm') {
      return;
    }

    this.isDeletingProject = true;
    this.projectError = '';
    try {
      await this.adminService.deleteProject(project.id);
      this.projects = this.projects.filter((item) => item.id !== project.id);
      this.projectNotice = `${project.name} removed.`;
      if (this.editingProjectId === project.id) {
        this.editingProjectId = null;
        this.isProjectFormOpen = false;
      }
    } catch (error) {
      console.error('[AdminPage] Failed to remove project:', error);
      this.projectError = 'Could not remove this project. Please try again.';
    } finally {
      this.isDeletingProject = false;
    }
  }

  private emptyProjectForm() {
    return {
      title: '',
      location: '',
      country: 'Egypt',
      description: '',
      highlights: [''],
      assetType: 'image' as 'image' | 'model',
      assetUrl: '',
      modelFormat: 'glb' as 'glb' | 'gltf',
    };
  }

  addProjectHighlight(): void {
    this.projectForm.highlights.push('');
  }

  removeProjectHighlight(index: number): void {
    if (this.projectForm.highlights.length <= 1) {
      this.projectForm.highlights[0] = '';
      return;
    }
    this.projectForm.highlights.splice(index, 1);
  }

  openCountryPicker(): void {
    this.isCountryPickerOpen = true;
    this.countrySearch = '';
    this.filteredProjectCountries = this.projectCountries;
  }

  closeCountryPicker(): void {
    this.isCountryPickerOpen = false;
    this.countrySearch = '';
  }

  filterProjectCountries(): void {
    const query = this.countrySearch.trim().toLowerCase();
    this.filteredProjectCountries = query
      ? this.projectCountries.filter((country) => country.name.toLowerCase().includes(query))
      : this.projectCountries;
  }

  selectProjectCountry(country: ProjectCountry): void {
    this.projectForm.country = country.name;
    this.closeCountryPicker();
  }

  onProjectFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.selectedProjectFile = null;
      return;
    }

    const isImage = this.projectForm.assetType === 'image' && file.type.startsWith('image/');
    const isModel = this.projectForm.assetType === 'model' && /\.(glb|gltf)$/i.test(file.name);
    if (!isImage && !isModel) {
      this.selectedProjectFile = null;
      this.projectError = this.projectForm.assetType === 'image'
        ? 'Choose a valid image file.'
        : 'Choose a .glb or .gltf model file.';
      input.value = '';
      return;
    }
    this.projectError = '';
    this.selectedProjectFile = file;
  }

  private countryCode(countryName: string): string {
    return this.projectCountries.find((country) => country.name === countryName)?.code ?? '';
  }

  get selectedRecipientCount(): number | null {
    const attendees = this.notificationAudience;
    if (!attendees) {
      return null;
    }
    if (this.audienceKind === 'all') {
      return attendees.length;
    }
    if (this.audienceKind === 'users') {
      return attendees.filter((attendee) => this.selectedUserIds.includes(attendee.id)).length;
    }
    if (this.audienceKind === 'plantVisitors') {
      return attendees.filter((attendee) => attendee.plantVisit).length;
    }
    const segment = this.notificationSegments.find(
      (item) => item.key === this.selectedSegmentKey
    );
    return segment
      ? attendees.filter((attendee) => this.matchesSegment(attendee, segment)).length
      : null;
  }

  get attendees(): AdminAttendee[] {
    return this.notificationAudience ?? [];
  }

  get notificationSegments(): AudienceSegment[] {
    return this.segments.filter((segment) => segment.field === 'participantsGroup');
  }

  get filteredNotificationUsers(): AdminAttendee[] {
    return this.filterAudienceUsers(this.notificationUserSearch);
  }

  get filteredActivityUsers(): AdminAttendee[] {
    return this.filterAudienceUsers(this.activityUserSearch);
  }

  private filterAudienceUsers(search: string): AdminAttendee[] {
    const query = search.trim().toLowerCase();
    return this.attendees.filter((attendee) =>
      !query ||
      [attendee.name, attendee.email, attendee.id].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }

  isAudienceUserSelected(userId: string, context: AudienceContext): boolean {
    return this.getAudienceSelectedUserIds(context).includes(userId);
  }

  toggleAudienceUser(userId: string, selected: boolean, context: AudienceContext): void {
    const selectedUserIds = this.getAudienceSelectedUserIds(context);
    this.setAudienceSelectedUserIds(
      context,
      selected
        ? [...new Set([...selectedUserIds, userId])]
        : selectedUserIds.filter((selectedUserId) => selectedUserId !== userId)
    );
  }

  onAudienceUserChange(userId: string, event: Event, context: AudienceContext): void {
    const checkbox = event.target;
    if (checkbox instanceof HTMLInputElement) {
      this.toggleAudienceUser(userId, checkbox.checked, context);
    }
  }

  selectVisibleUsers(context: AudienceContext): void {
    const selectedUserIds = this.getAudienceSelectedUserIds(context);
    const visibleUsers = this.getVisibleAudienceUsers(context);
    this.setAudienceSelectedUserIds(
      context,
      [...new Set([
        ...selectedUserIds,
        ...visibleUsers.map((attendee) => attendee.id),
      ])]
    );
  }

  selectAllPushReadyUsers(context: AudienceContext): void {
    this.setAudienceSelectedUserIds(
      context,
      this.attendees
        .filter((attendee) => attendee.hasPushToken)
        .map((attendee) => attendee.id)
    );
  }

  clearSelectedUsers(context: AudienceContext): void {
    this.setAudienceSelectedUserIds(context, []);
  }

  private getAudienceSelectedUserIds(context: AudienceContext): string[] {
    return context === 'activity' ? this.activitySelectedUserIds : this.selectedUserIds;
  }

  private setAudienceSelectedUserIds(context: AudienceContext, userIds: string[]): void {
    if (context === 'activity') {
      this.activitySelectedUserIds = userIds;
    } else {
      this.selectedUserIds = userIds;
    }
  }

  private getVisibleAudienceUsers(context: AudienceContext): AdminAttendee[] {
    return context === 'activity'
      ? this.filteredActivityUsers
      : this.filteredNotificationUsers;
  }

  get selectedActivityRecipientCount(): number | null {
    return this.getAudienceRecipientCount(this.activityAudienceKind, 'activity');
  }

  get pushReadyActivityRecipientCount(): number | null {
    return this.getAudienceRecipientCount(this.activityAudienceKind, 'activity', true);
  }

  private getAudienceRecipientCount(
    audienceKind: AudienceKind,
    context: AudienceContext,
    pushReadyOnly = false
  ): number | null {
    if (!this.notificationAudience) {
      return null;
    }
    let recipients = this.attendees;
    if (audienceKind === 'users') {
      const selected = this.getAudienceSelectedUserIds(context);
      recipients = recipients.filter((attendee) => selected.includes(attendee.id));
    } else if (audienceKind === 'group') {
      const selectedKey =
        context === 'activity'
          ? this.activitySelectedSegmentKey
          : this.selectedSegmentKey;
      const group = this.notificationSegments.find((segment) => segment.key === selectedKey);
      if (!group) {
        return null;
      }
      recipients = recipients.filter((attendee) => this.matchesSegment(attendee, group));
    } else if (audienceKind === 'plantVisitors') {
      recipients = recipients.filter((attendee) => attendee.plantVisit);
    }
    return pushReadyOnly
      ? recipients.filter((attendee) => attendee.hasPushToken).length
      : recipients.length;
  }

  countUsersInGroup(group: AudienceSegment): number {
    return this.attendees.filter((attendee) => this.matchesSegment(attendee, group)).length;
  }

  countPushReadyUsersInGroup(group: AudienceSegment): number {
    return this.attendees.filter(
      (attendee) => attendee.hasPushToken && this.matchesSegment(attendee, group)
    ).length;
  }

  get nationalityGreetings(): NationalityGreeting[] {
    const greetings = new Map<string, NationalityGreeting>();
    for (const attendee of this.dashboard?.attendees ?? []) {
      const nationality = attendee.nationality.trim();
      if (!nationality) {
        continue;
      }
      const key = nationality.toLowerCase();
      const existing = greetings.get(key);
      if (existing) {
        existing.attendeeCount += 1;
      } else {
        greetings.set(key, {
          nationality,
          greeting: greetingForNationality(nationality),
          attendeeCount: 1,
        });
      }
    }
    return [...greetings.values()].sort((a, b) => a.nationality.localeCompare(b.nationality));
  }

  get filteredAttendees(): AdminAttendee[] {
    const query = this.attendeeSearch.trim().toLowerCase();
    return (this.dashboard?.attendees ?? []).filter((attendee) => {
      const matchesQuery =
        !query ||
        [attendee.name, attendee.email, attendee.id, attendee.day2Group, attendee.day3Type,
          attendee.day3GroupAM, attendee.day3GroupPM]
          .some((value) => value.toLowerCase().includes(query));
      const matchesStatus =
        this.attendeeStatusFilter === 'all' ||
        (this.attendeeStatusFilter === 'active' && attendee.active) ||
        (this.attendeeStatusFilter === 'loggedIn' && attendee.loggedIn) ||
        (this.attendeeStatusFilter === 'installed' && attendee.installed) ||
        (this.attendeeStatusFilter === 'pushReady' && attendee.hasPushToken);
      return matchesQuery && matchesStatus;
    });
  }

  get attendeesWithFlights(): AdminAttendee[] {
    return (this.dashboard?.attendees ?? []).filter((attendee) => attendee.flightDetails);
  }

  exportAttendees(): void {
    const headers = ['Name', 'Email', 'ID', 'Logged in', 'Active', 'Installed', 'Push ready',
      'Day 2 group', 'Day 3 type', 'Day 3 morning group', 'Day 3 afternoon group'];
    const rows = this.filteredAttendees.map((attendee) => [
      attendee.name, attendee.email, attendee.id, attendee.loggedIn, attendee.active,
      attendee.installed, attendee.hasPushToken, attendee.day2Group, attendee.day3Type,
      attendee.day3GroupAM, attendee.day3GroupPM,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendees.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  get pushReadyRecipientCount(): number | null {
    const attendees = this.notificationAudience;
    if (!attendees) {
      return null;
    }
    if (this.audienceKind === 'all') {
      return attendees.filter((attendee) => attendee.hasPushToken).length;
    }
    if (this.audienceKind === 'users') {
      return attendees.filter(
        (attendee) =>
          this.selectedUserIds.includes(attendee.id) && attendee.hasPushToken
      ).length;
    }
    if (this.audienceKind === 'plantVisitors') {
      return attendees.filter(
        (attendee) => attendee.plantVisit && attendee.hasPushToken
      ).length;
    }
    const segment = this.notificationSegments.find(
      (item) => item.key === this.selectedSegmentKey
    );
    return segment
      ? attendees.filter(
          (attendee) =>
            attendee.hasPushToken && this.matchesSegment(attendee, segment)
        ).length
      : null;
  }

  get minScheduledDateTime(): string {
    return formatEgyptDateTime(new Date(Date.now() + 2 * 60 * 1000));
  }

  async sendNotification(): Promise<void> {
    const title = this.notificationTitle.trim();
    const body = this.notificationBody.trim();
    const target = this.getNotificationTarget();
    if (!title || !body || !target) {
      this.errorMessage = 'Enter a title and message, then choose a valid audience.';
      return;
    }
    if (!this.pushReadyRecipientCount) {
      this.errorMessage = 'No selected attendees have enabled push notifications.';
      return;
    }

    let scheduledAt: string | null = null;
    if (this.updateMode === 'scheduled') {
      try {
        scheduledAt = egyptDateTimeToIso(this.scheduledDateTime);
      } catch (error) {
        this.errorMessage =
          error instanceof Error ? error.message : 'Enter a valid Egypt date and time.';
        return;
      }
      if (Date.parse(scheduledAt) < Date.now() + 60_000) {
        this.errorMessage = 'Choose a send time at least one minute in the future.';
        return;
      }
    }

    const scheduledDisplay = scheduledAt
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Cairo',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(scheduledAt))
      : '';
    const confirmation = await this.alertController.create({
      header: scheduledAt ? 'Schedule push notification?' : 'Send push notification?',
      message: scheduledAt
        ? `This will send the message to ${this.pushReadyRecipientCount} device(s) at ${scheduledDisplay} Egypt time.`
        : `This will send the message to ${this.pushReadyRecipientCount} device(s).`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: scheduledAt ? 'Schedule' : 'Send now', role: 'confirm' },
      ],
    });
    await confirmation.present();
    const { role } = await confirmation.onDidDismiss();
    if (role !== 'confirm') {
      return;
    }

    this.isSending = true;
    this.errorMessage = '';
    this.noticeMessage = '';
    try {
      const result = scheduledAt
        ? await this.adminService.scheduleNotification(title, body, target, scheduledAt)
        : await this.adminService.sendNotification(title, body, target);
      this.notificationTitle = '';
      this.notificationBody = '';
      this.scheduledDateTime = '';
      if (result.status === 'failed') {
        this.errorMessage = this.notificationResultMessage(result, scheduledDisplay);
      } else {
        this.noticeMessage = this.notificationResultMessage(result, scheduledDisplay);
      }
      await this.loadDashboard(true);
    } catch (error: any) {
      console.error('[AdminPage] Failed to send notification:', error);
      this.errorMessage =
        error?.message ||
        'The notification could not be sent. Review the selected audience and try again.';
    } finally {
      this.isSending = false;
    }
  }

  private notificationResultMessage(
    result: NotificationSendResult,
    scheduledDisplay: string
  ): string {
    if (result.status === 'scheduled') {
      return `Notification scheduled for ${scheduledDisplay} Egypt time; audience ${result.targetCount}, ${result.pushReadyCount} push-enabled.`;
    }
    return (
      `Notification ${result.status}: ${result.acceptedCount} accepted, ` +
      `${result.failedCount} failed; audience ${result.targetCount}, ` +
      `${result.pushReadyCount} push-enabled.`
    );
  }

  openRate(campaign: AdminCampaign): number {
    return campaign.acceptedCount
      ? Math.round((campaign.openedCount / campaign.acceptedCount) * 100)
      : 0;
  }

  addActivityOption(): void {
    if (this.activityOptions.length < 6) {
      this.activityOptions = [...this.activityOptions, ''];
    }
  }

  removeActivityOption(index: number): void {
    if (this.activityOptions.length <= 2) return;
    this.activityOptions = this.activityOptions.filter((_, optionIndex) => optionIndex !== index);
    if (this.correctOptionIndex >= this.activityOptions.length) {
      this.correctOptionIndex = this.activityOptions.length - 1;
    }
  }

  async createInteractiveActivity(): Promise<void> {
    const title = this.activityTitle.trim();
    const question = this.activityQuestion.trim();
    const options = this.activityOptions.map((option) => option.trim());
    const target = this.getActivityTarget();
    if (
      !title ||
      !question ||
      options.some((option) => !option) ||
      !target ||
      !this.notificationAudience
    ) {
      this.activityError = 'Enter a title, question, at least two options, and a valid audience.';
      return;
    }

    this.isCreatingActivity = true;
    this.activityError = '';
    this.activityNotice = '';
    try {
      const result = await this.adminService.createInteractiveActivity({
        title,
        question,
        options,
        kind: this.activityKind,
        target,
        correctOptionIndex:
          this.activityKind === 'quiz' ? this.correctOptionIndex : null,
      });
      this.activityTitle = '';
      this.activityQuestion = '';
      this.activityOptions = ['', ''];
      this.correctOptionIndex = 0;
      this.activitySelectedUserIds = [];
      this.activityUserSearch = '';
      this.activitySelectedSegmentKey = '';
      this.activityNotice = `${this.activityKind === 'quiz' ? 'Quiz' : 'Poll'} published for attendees.`;
      if (result.notificationSummary?.deliveryError) {
        this.activityNotice += ' Push notification delivery failed; attendees can still access it in the app.';
      } else if (result.notificationSummary?.pushReadyCount === 0) {
        this.activityNotice += ' No attendees in this audience have enabled push notifications.';
      } else if (result.notificationSummary) {
        this.activityNotice +=
          ` Push notifications accepted: ${result.notificationSummary.acceptedCount}; ` +
          `failed: ${result.notificationSummary.failedCount}.`;
      }
      await this.loadAdminActivities();
    } catch (error) {
      console.error('[AdminPage] Failed to create quiz or poll:', error);
      this.activityError = 'Could not publish this quiz or poll. Please try again.';
    } finally {
      this.isCreatingActivity = false;
    }
  }

  toggleActivityResults(activityId: string): void {
    this.showActivityResults[activityId] = !this.showActivityResults[activityId];
  }

  async loadAdminActivities(): Promise<void> {
    try {
      const result = await this.adminService.listAdminInteractiveActivities();
      this.adminActivities = result.activities;
      this.activityLoadError = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load quizzes and polls:', error);
      this.activityLoadError = 'Published quiz and poll results are unavailable.';
    }
  }

  private getNotificationTarget(): NotificationTarget | null {
    return this.getAudienceTarget(
      this.audienceKind,
      'update',
      this.selectedSegmentKey
    );
  }

  private getActivityTarget(): NotificationTarget | null {
    return this.getAudienceTarget(
      this.activityAudienceKind,
      'activity',
      this.activitySelectedSegmentKey
    );
  }

  private getAudienceTarget(
    audienceKind: AudienceKind,
    context: AudienceContext,
    segmentKey: string
  ): NotificationTarget | null {
    if (audienceKind === 'all') {
      return { kind: 'all' };
    }
    if (audienceKind === 'users') {
      const userIds = [...new Set(this.getAudienceSelectedUserIds(context))];
      return userIds.length ? { kind: 'users', userIds } : null;
    }
    if (audienceKind === 'plantVisitors') {
      return { kind: 'segment', field: 'plantVisit', value: 'true' };
    }
    const group = this.notificationSegments.find((segment) => segment.key === segmentKey);
    return group
      ? { kind: 'segment', field: group.field, value: group.value }
      : null;
  }

  private buildSegments(attendees: AdminAttendee[]): AudienceSegment[] {
    const fields: { field: SegmentField; label: string; value: (attendee: AdminAttendee) => string }[] = [
      {
        field: 'day2.group',
        label: 'Day 2 group',
        value: (attendee) => attendee.day2Group,
      },
      {
        field: 'day3.type',
        label: 'Day 3 track/type',
        value: (attendee) => attendee.day3Type,
      },
      {
        field: 'day3.groupAM',
        label: 'Day 3 morning group',
        value: (attendee) => attendee.day3GroupAM,
      },
      {
        field: 'day3.groupPM',
        label: 'Day 3 afternoon group',
        value: (attendee) => attendee.day3GroupPM,
      },
      {
        field: 'participantsGroup',
        label: 'Participants group',
        value: (attendee) => attendee.participantsGroup,
      },
      {
        field: 'plantVisit',
        label: 'Plant visitors',
        value: (attendee) => attendee.plantVisit ? 'true' : '',
      },
    ];
    const segments: AudienceSegment[] = [];
    for (const item of fields) {
      const values = new Set(attendees.map(item.value).filter(Boolean));
      for (const value of values) {
        segments.push({
          key: `${item.field}:${value}`,
          field: item.field,
          value,
          label: item.field === 'plantVisit' ? item.label : `${item.label}: ${value}`,
        });
      }
    }
    return segments.sort((a, b) => a.label.localeCompare(b.label));
  }

  private matchesSegment(
    attendee: AdminAttendee,
    segment: AudienceSegment
  ): boolean {
    const values: Record<SegmentField, string> = {
      'day2.group': attendee.day2Group,
      'day3.type': attendee.day3Type,
      'day3.groupAM': attendee.day3GroupAM,
      'day3.groupPM': attendee.day3GroupPM,
      participantsGroup: attendee.participantsGroup,
      plantVisit: attendee.plantVisit ? 'true' : '',
    };
    return values[segment.field] === segment.value;
  }
}
