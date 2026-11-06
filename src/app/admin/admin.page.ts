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
  calendarOutline,
  downloadOutline,
  folderOpenOutline,
  gridOutline,
  notificationsOutline,
  peopleOutline,
  refreshOutline,
  trashOutline,
  sendOutline,
  star,
  starOutline,
  statsChartOutline,
  cloudUploadOutline,
  chevronUpOutline,
  closeCircle,
  timeOutline,
} from 'ionicons/icons';
import { interval } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import {
  AdminAttendee,
  AdminCampaign,
  AdminDashboard,
  AdminHomeAnnouncement,
  AdminInteractiveActivity,
  AdminRequest,
  AdminResource,
  AdminService,
  AgendaSessionOption,
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
import { EventArchiveService } from '../services/event-archive.service';

type SegmentField = 'participantsGroup' | 'plantVisit' | 'group' | 'rebrandingEvent';
type AudienceKind = 'all' | 'users' | 'group' | 'groupNumber' | 'plantVisitors' | 'nonPlantVisitors' | 'rebrandingEvent';
type AudienceContext = 'update' | 'activity';

interface AudienceSegment {
  key: string;
  field: SegmentField;
  value: string;
  label: string;
}

type AdminSection = 'overview' | 'attendees' | 'flights' | 'requests' | 'engagement' | 'projects' | 'resources' | 'updates' | 'event';
type UpdateMode = 'now' | 'scheduled';
type AttendeeStatusFilter = 'all' | 'active' | 'loggedIn' | 'installed' | 'pushReady';
interface ProjectCountry {
  name: string;
  code: string;
}

export interface ProjectImageItem {
  id: string;
  previewUrl: string;
  storedUrl?: string;
  file?: File;
  name: string;
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
  private readonly eventArchiveService = inject(EventArchiveService);
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
  selectedAudienceKinds: AudienceKind[] = ['all'];
  selectedSegmentKeys: string[] = [];
  selectedGroupNumberKeys: string[] = ['group:group 1'];
  selectedRebrandingValues: Array<'true' | 'false'> = ['true'];
  selectedPlantVisitValues: Array<'true' | 'false'> = ['true'];
  selectedGroupNumberKey = 'group:group 1';
  selectedRebrandingValue: 'true' | 'false' = 'true';
  notificationTitle = '';
  notificationBody = '';
  highlightOnHome = false;
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
  activitySelectedAudienceKinds: AudienceKind[] = ['all'];
  activitySelectedSegmentKeys: string[] = [];
  activitySelectedGroupNumberKeys: string[] = ['group:group 1'];
  activitySelectedRebrandingValues: Array<'true' | 'false'> = ['true'];
  activitySelectedPlantVisitValues: Array<'true' | 'false'> = ['true'];
  activitySelectedGroupNumberKey = 'group:group 1';
  activitySelectedRebrandingValue: 'true' | 'false' = 'true';
  activitySessionName = '';
  activitySpeakerName = '';
  activityDay: string | number | null = null;
  activityScheduleLocked = true;
  isActivitySessionPickerOpen = false;
  activitySessionSearch = '';
  selectedActivitySessionDayFilter = 'All';
  filteredActivityAgendaSessionOptions: AgendaSessionOption[] = [];
  activityGroupFilterMap: Record<string, string> = {};
  isCreatingActivity = false;
  activityNotice = '';
  activityError = '';
  activityActionError = '';
  updatingActivityId = '';
  showActivityResults: Record<string, boolean> = {};
  adminActivities: AdminInteractiveActivity[] = [];
  isLoadingActivities = false;
  requests: AdminRequest[] = [];
  isLoadingRequests = false;
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
  isLoadingAttendeeDetails = false;
  attendeeDetailsError = '';
  isSavingProject = false;
  isDeletingProject = false;
  editingProjectId: string | null = null;
  isProjectFormOpen = false;
  selectedProjectFile: File | null = null;
  projectImageItems: ProjectImageItem[] = [];
  primaryProjectImageId = '';
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
  resourceUploadPercent: number | null = null;
  resourceUploadStatusText = '';
  private resourceUploadAbortController?: AbortController;
  resourceForm = this.emptyResourceForm();
  resourceTypes: ResourceType[] = [...DEFAULT_RESOURCE_TYPES];
  agendaSessionOptions: AgendaSessionOption[] = [];
  filteredAgendaSessionOptions: AgendaSessionOption[] = [];
  isSessionPickerOpen = false;
  sessionSearch = '';
  selectedSessionDayFilter = 'All';
  newResourceType = '';
  isSavingResourceType = false;
  eventEndDateTime = '';
  isLoadingEventConfiguration = true;
  isSavingEventConfiguration = false;
  eventConfigurationError = '';
  eventConfigurationNotice = '';

  private refreshTimer?: ReturnType<typeof setInterval>;
  private navigationSubscription?: Subscription;
  private hasLoadedFlightDetails = false;
  private hasLoadedSafetyInductionStatus = false;
  isConnectingHse = false;
  isHseConnected = false;
  private flightDetailsLoad?: Promise<void>;
  private safetyInductionLoad?: Promise<void>;

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
      star,
      starOutline,
      statsChartOutline,
      cloudUploadOutline,
      calendarOutline,
      chevronUpOutline,
      closeCircle,
      timeOutline,
    });
  }

  returnToApp(): void {
    void this.router.navigateByUrl('/tabs/home');
  }

  selectSection(section: AdminSection): void {
    this.selectedSection = section;
    if (section === 'flights' && this.dashboard) {
      void this.loadFlightDetails();
    }
    if (section === 'projects' && !this.projects.length && !this.isLoadingProjects) {
      void this.loadProjects();
    }
    if (section === 'resources' && !this.resources.length && !this.isLoadingResources) {
      void this.loadResources();
    }
  }

  onSectionTabKeydown(event: KeyboardEvent, currentSection: AdminSection): void {
    const sections: AdminSection[] = ['overview', 'attendees', 'flights', 'requests', 'engagement', 'projects', 'resources', 'updates', 'event'];
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
    this.selectSectionFromUrl();
    this.navigationSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.selectSectionFromUrl());
    void this.registerFormControls().catch((error: unknown) => {
      console.error('[AdminPage] Failed to register admin form controls:', error);
      this.formControlsError = 'Admin forms could not be loaded. Reload the page and try again.';
    });
    void this.loadDashboard();
    void this.loadNotificationAudience();
    void this.loadAdminActivities();
    void this.loadRequests();
    void this.loadEventConfiguration();
    this.refreshTimer = setInterval(() => {
      if (!this.isLoading && !this.isSending) {
        if (this.selectedSection === 'flights') {
          this.hasLoadedFlightDetails = false;
        }
        void this.loadDashboard(true);
        void this.loadNotificationAudience();
        void this.loadRequests();
        if (this.selectedSection === 'projects') {
          void this.loadProjects(true);
        } else if (this.selectedSection === 'resources') {
          void this.loadResources();
        } else if (this.selectedSection === 'engagement') {
          void this.loadAdminActivities();
        } else if (this.selectedSection === 'event') {
          void this.loadEventConfiguration();
        }
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

  async loadEventConfiguration(): Promise<void> {
    this.isLoadingEventConfiguration = true;
    this.eventConfigurationError = '';
    try {
      const eventEndAt = await this.adminService.loadEventEndAt();
      this.eventEndDateTime = eventEndAt ? formatEgyptDateTime(eventEndAt) : '';
    } catch (error) {
      console.error('[AdminPage] Failed to load event configuration:', error);
      this.eventConfigurationError = 'Could not load the event end time. Check your admin access and try again.';
    } finally {
      this.isLoadingEventConfiguration = false;
    }
  }

  async saveEventConfiguration(): Promise<void> {
    if (this.isSavingEventConfiguration || this.isLoadingEventConfiguration) return;

    this.isSavingEventConfiguration = true;
    this.eventConfigurationError = '';
    this.eventConfigurationNotice = '';
    try {
      const eventEndAt = this.eventEndDateTime.trim()
        ? new Date(egyptDateTimeToIso(this.eventEndDateTime))
        : null;
      await this.adminService.saveEventEndAt(eventEndAt);
      await this.eventArchiveService.refresh();
      this.eventConfigurationNotice = eventEndAt
        ? 'Event end time saved. The archive will activate at this Cairo time.'
        : 'Event end time cleared. The automatic archive state is disabled.';
    } catch (error) {
      console.error('[AdminPage] Failed to save event configuration:', error);
      this.eventConfigurationError =
        error instanceof Error ? error.message : 'Could not save the event end time. Try again.';
    } finally {
      this.isSavingEventConfiguration = false;
    }
  }

  ionViewDidEnter(): void {
    document.getElementById('admin-title')?.focus();
  }

  async loadRequests(): Promise<void> {
    this.isLoadingRequests = true;
    try {
      this.requests = await this.adminService.loadAdminRequests();
      this.requestLoadError = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load requests:', error);
      this.requestLoadError = 'Could not load help requests.';
    } finally {
      this.isLoadingRequests = false;
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
    this.navigationSubscription?.unsubscribe();
  }

  private selectSectionFromUrl(): void {
    const section = this.router.parseUrl(this.router.url).queryParams['section'];
    if (section === 'requests') {
      this.selectSection('requests');
    }
  }

  async loadDashboard(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }

    try {
      const loadedDashboard = await this.adminService.loadDashboard();
      const previousAttendees = new Map(
        (this.dashboard?.attendees ?? []).map((attendee) => [attendee.id, attendee])
      );
      this.dashboard = {
        ...loadedDashboard,
        attendees: loadedDashboard.attendees.map((attendee) => ({
          ...previousAttendees.get(attendee.id),
          ...attendee,
        })),
      };
      this.errorMessage = '';
      if (this.selectedSection === 'flights') {
        void this.loadFlightDetails();
      }
    } catch (error) {
      console.error('[AdminPage] Failed to load dashboard:', error);
      this.errorMessage =
        'Could not load the admin dashboard. Check your connection and admin access, then try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadFlightDetails(): Promise<void> {
    if (
      !this.dashboard ||
      this.hasLoadedFlightDetails ||
      this.flightDetailsLoad
    ) {
      return this.flightDetailsLoad;
    }

    this.isLoadingAttendeeDetails = true;
    this.attendeeDetailsError = '';
    this.flightDetailsLoad = this.adminService
      .loadFlightDetailsForAttendees(this.dashboard.attendees)
      .then((attendees) =>
        this.adminService
          .loadAccommodationDetailsForAttendees(attendees)
          .catch((error: unknown) => {
            console.warn('[AdminPage] Failed to load accommodation details:', error);
            return attendees;
          })
      )
      .then((attendees) =>
        this.adminService
          .loadCarDetailsForAttendees(attendees)
          .catch((error: unknown) => {
            console.warn('[AdminPage] Failed to load car details:', error);
            return attendees;
          })
      )
      .then((attendees) => {
        if (this.dashboard) {
          this.dashboard = { ...this.dashboard, attendees };
        }
        this.hasLoadedFlightDetails = true;
      })
      .catch((error: unknown) => {
        console.error('[AdminPage] Failed to load flight details:', error);
        this.attendeeDetailsError = 'Flight details could not be loaded. Please try again.';
      })
      .finally(() => {
        this.isLoadingAttendeeDetails = false;
        this.flightDetailsLoad = undefined;
      });
    return this.flightDetailsLoad;
  }

  private async loadSafetyInductionStatuses(): Promise<void> {
    if (
      !this.dashboard ||
      this.hasLoadedSafetyInductionStatus ||
      this.safetyInductionLoad
    ) {
      return this.safetyInductionLoad;
    }

    this.isLoadingAttendeeDetails = true;
    this.attendeeDetailsError = '';
    this.safetyInductionLoad = this.adminService
      .loadSafetyInductionStatus(this.dashboard.attendees)
      .then((attendees) => {
        if (this.dashboard) {
          this.dashboard = { ...this.dashboard, attendees };
        }
        this.hasLoadedSafetyInductionStatus = true;
      })
      .catch((error: unknown) => {
        console.error('[AdminPage] Failed to load safety induction status:', error);
        this.isHseConnected = false;
        if (this.dashboard) {
          this.dashboard = {
            ...this.dashboard,
            attendees: this.dashboard.attendees.map((attendee) =>
              attendee.plantVisit
                ? {
                    ...attendee,
                    safetyInductionCompleted: undefined,
                    safetyInductionStatus: 'Unavailable',
                  }
                : {
                    ...attendee,
                    safetyInductionCompleted: undefined,
                    safetyInductionStatus: 'N/A',
                  }
            ),
          };
        }
        this.attendeeDetailsError =
          'Safety induction statuses could not be loaded. Confirm your account has HSE admin access, then try again.';
      })
      .finally(() => {
        this.isLoadingAttendeeDetails = false;
        this.safetyInductionLoad = undefined;
      });
    return this.safetyInductionLoad;
  }

  async connectHseAndLoadSafetyInductionStatuses(): Promise<void> {
    if (!this.dashboard || this.isConnectingHse) {
      return;
    }

    this.isConnectingHse = true;
    this.attendeeDetailsError = '';
    try {
      await this.adminService.connectHseAdmin();
      this.isHseConnected = true;
      this.hasLoadedSafetyInductionStatus = false;
      await this.loadSafetyInductionStatuses();
    } catch (error) {
      console.error('[AdminPage] Failed to connect to HSE:', error);
      this.attendeeDetailsError =
        error instanceof Error && error.message
          ? error.message
          : 'Could not connect to HSE. Check your HSE admin access and try again.';
    } finally {
      this.isConnectingHse = false;
    }
  }

  retryAttendeeDetails(): void {
    if (this.selectedSection === 'flights') {
      this.hasLoadedFlightDetails = false;
      void this.loadFlightDetails();
    } else if (this.selectedSection === 'attendees') {
      void this.connectHseAndLoadSafetyInductionStatuses();
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

  async loadProjects(forceRefresh = false): Promise<void> {
    this.isLoadingProjects = true;
    this.projectLoadError = '';
    try {
      this.projects = await this.adminService.loadProjects(forceRefresh);
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
      const [resources, resourceTypes, agendaSessionOptions] = await Promise.all([
        this.adminService.loadResources(),
        this.adminService.loadResourceTypes(),
        this.adminService.loadAgendaSessionOptions(),
      ]);
      this.resources = resources;
      this.resourceTypes = resourceTypes;
      this.agendaSessionOptions = agendaSessionOptions;
      this.filterAgendaSessions();
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
    this.closeSessionPicker();
  }

  editResource(resource: AdminResource): void {
    this.editingResourceId = resource.id;
    this.isResourceFormOpen = true;
    this.resourceForm = {
      title: resource.title,
      type: resource.type,
      description: resource.description,
      url: resource.url,
      sessionName: resource.sessionName ?? '',
      speakerName: resource.speakerName ?? '',
      speakerTitle: resource.speakerTitle ?? '',
    };
    this.selectedResourceFile = null;
    this.resourceError = '';
    this.closeSessionPicker();
  }

  get agendaSessionDays(): string[] {
    const days = Array.from(
      new Set(
        this.agendaSessionOptions
          .map((option) => option.day)
          .filter((day): day is number => typeof day === 'number')
      )
    ).sort((a, b) => a - b);
    return ['All', ...days.map((day) => `Day ${day}`)];
  }

  get selectedAgendaSessionOption(): AgendaSessionOption | null {
    if (!this.resourceForm.sessionName) {
      return null;
    }
    return (
      this.agendaSessionOptions.find(
        (option) => option.sessionName === this.resourceForm.sessionName
      ) ?? null
    );
  }

  toggleSessionPicker(): void {
    this.isSessionPickerOpen = !this.isSessionPickerOpen;
    if (this.isSessionPickerOpen) {
      this.sessionSearch = '';
      this.selectedSessionDayFilter = 'All';
      this.filterAgendaSessions();
    }
  }

  closeSessionPicker(): void {
    this.isSessionPickerOpen = false;
    this.sessionSearch = '';
    this.selectedSessionDayFilter = 'All';
    this.filterAgendaSessions();
  }

  setSessionDayFilter(dayFilter: string): void {
    this.selectedSessionDayFilter = dayFilter;
    this.filterAgendaSessions();
  }

  filterAgendaSessions(): void {
    const query = this.sessionSearch.trim().toLowerCase();
    this.filteredAgendaSessionOptions = this.agendaSessionOptions.filter((option) => {
      const dayLabel = option.day ? `Day ${option.day}` : '';
      if (
        this.selectedSessionDayFilter !== 'All' &&
        dayLabel !== this.selectedSessionDayFilter
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      const searchable = [
        option.sessionName,
        option.speakerName,
        option.speakerTitle,
        option.category,
        dayLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }

  selectAgendaSession(option: AgendaSessionOption | null): void {
    this.onResourceSessionChange(option?.sessionName ?? '');
    this.closeSessionPicker();
  }

  clearSelectedAgendaSession(event: Event): void {
    event.stopPropagation();
    this.selectAgendaSession(null);
  }

  onResourceSessionChange(sessionName: string): void {
    const normalized = (sessionName || '').trim();
    this.resourceForm.sessionName = normalized;
    if (!normalized) {
      this.resourceForm.speakerName = '';
      this.resourceForm.speakerTitle = '';
      return;
    }
    const matched = this.agendaSessionOptions.find(
      (option) => option.sessionName === normalized
    );
    if (matched) {
      this.resourceForm.speakerName = matched.speakerName || '';
      this.resourceForm.speakerTitle = matched.speakerTitle || '';
      if (!this.resourceForm.title.trim()) {
        this.resourceForm.title = matched.sessionName;
      }
    }
  }

  get selectedActivityAgendaSessionOption(): AgendaSessionOption | null {
    if (!this.activitySessionName) return null;
    return (
      this.agendaSessionOptions.find(
        (option) => option.sessionName === this.activitySessionName
      ) ?? null
    );
  }

  toggleActivitySessionPicker(): void {
    this.isActivitySessionPickerOpen = !this.isActivitySessionPickerOpen;
    if (this.isActivitySessionPickerOpen) {
      void this.ensureAgendaSessionOptions();
      this.filterActivityAgendaSessions();
    }
  }

  closeActivitySessionPicker(): void {
    this.isActivitySessionPickerOpen = false;
  }

  setActivitySessionDayFilter(dayFilter: string): void {
    this.selectedActivitySessionDayFilter = dayFilter;
    this.filterActivityAgendaSessions();
  }

  filterActivityAgendaSessions(): void {
    const query = this.activitySessionSearch.trim().toLowerCase();
    this.filteredActivityAgendaSessionOptions = this.agendaSessionOptions.filter((option) => {
      const dayLabel = option.day ? `Day ${option.day}` : '';
      if (
        this.selectedActivitySessionDayFilter !== 'All' &&
        dayLabel !== this.selectedActivitySessionDayFilter
      ) {
        return false;
      }
      if (!query) return true;
      const searchable = [
        option.sessionName,
        option.speakerName,
        option.speakerTitle,
        option.category,
        dayLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }

  selectActivityAgendaSession(option: AgendaSessionOption | null): void {
    if (!option) {
      this.activitySessionName = '';
      this.activitySpeakerName = '';
      this.activityDay = null;
    } else {
      this.activitySessionName = option.sessionName;
      this.activitySpeakerName = option.speakerName || '';
      this.activityDay = option.day ?? null;
      if (!this.activityTitle.trim()) {
        this.activityTitle = option.sessionName;
      }
    }
    this.closeActivitySessionPicker();
  }

  clearSelectedActivityAgendaSession(event: Event): void {
    event.stopPropagation();
    this.selectActivityAgendaSession(null);
  }

  async ensureAgendaSessionOptions(): Promise<void> {
    if (this.agendaSessionOptions.length) {
      this.filterActivityAgendaSessions();
      return;
    }
    try {
      this.agendaSessionOptions = await this.adminService.loadAgendaSessionOptions();
      this.filterAgendaSessions();
      this.filterActivityAgendaSessions();
    } catch (e) {
      console.warn('[AdminPage] Could not load agenda sessions:', e);
    }
  }

  getActivityGroupFilter(activityId: string): string {
    return this.activityGroupFilterMap[activityId] || 'all';
  }

  setActivityGroupFilter(activityId: string, group: string): void {
    this.activityGroupFilterMap[activityId] = group;
  }

  getFilteredActivityResponses(activity: AdminInteractiveActivity): AdminInteractiveActivityResponse[] {
    const responses = activity.responses || [];
    const filter = this.getActivityGroupFilter(activity.id);
    if (filter === 'all') return responses;
    const filterNormalized = filter.toLowerCase().replace(/\s+/g, '');
    return responses.filter((r) => {
      const g = (r.group || '').toLowerCase().replace(/\s+/g, '');
      return g === filterNormalized || g === filterNormalized.replace('group', '');
    });
  }

  getFilteredActivityOptionCounts(activity: AdminInteractiveActivity): number[] {
    const filter = this.getActivityGroupFilter(activity.id);
    if (filter === 'all') return activity.optionCounts;
    const counts = activity.options.map(() => 0);
    for (const r of this.getFilteredActivityResponses(activity)) {
      if (r.optionIndex !== null && r.optionIndex >= 0 && r.optionIndex < counts.length) {
        counts[r.optionIndex] += 1;
      }
    }
    return counts;
  }

  getFilteredActivityOptionPercentage(activity: AdminInteractiveActivity, index: number): number {
    const counts = this.getFilteredActivityOptionCounts(activity);
    const total = counts.reduce((a, b) => a + b, 0);
    return total ? Math.round((counts[index] / total) * 100) : 0;
  }

  getFilteredActivityCorrectCount(activity: AdminInteractiveActivity): number {
    return this.getFilteredActivityResponses(activity).filter((r) => r.isCorrect === true).length;
  }

  countActivityResponsesForGroup(activity: AdminInteractiveActivity, groupName: string): number {
    const responses = activity.responses || [];
    const target = groupName.toLowerCase().replace(/\s+/g, '');
    return responses.filter((r) => {
      const g = (r.group || '').toLowerCase().replace(/\s+/g, '');
      return g === target || g === target.replace('group', '');
    }).length;
  }

  cancelResourceEdit(): void {
    this.resourceUploadAbortController?.abort();
    this.resourceUploadAbortController = undefined;
    this.resourceUploadPercent = null;
    this.resourceUploadStatusText = '';
    this.editingResourceId = null;
    this.isResourceFormOpen = false;
    this.selectedResourceFile = null;
    this.resourceError = '';
    this.closeSessionPicker();
  }

  onResourceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedResourceFile = input.files?.[0] ?? null;
    this.resourceUploadPercent = null;
    this.resourceUploadStatusText = '';
    if (this.selectedResourceFile) {
      this.resourceForm.url = '';
    }
  }

  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    this.resourceUploadPercent = this.selectedResourceFile ? 0 : null;
    this.resourceUploadStatusText = this.selectedResourceFile
      ? `Starting upload (${this.formatFileSize(this.selectedResourceFile.size)})...`
      : 'Saving resource...';
    const abortController = new AbortController();
    this.resourceUploadAbortController = abortController;
    try {
      const url = this.selectedResourceFile
        ? await this.adminService.uploadResource(
            this.selectedResourceFile,
            form.title.trim(),
            {
              signal: abortController.signal,
              onProgress: ({ percent, bytesTransferred, totalBytes }) => {
                this.resourceUploadPercent = percent;
                this.resourceUploadStatusText = `Uploading ${percent}% (${this.formatFileSize(
                  bytesTransferred
                )} / ${this.formatFileSize(totalBytes)})`;
              },
            }
          )
        : form.url.trim();
      this.resourceUploadStatusText = 'Saving resource metadata...';
      const sessionName = form.sessionName.trim();
      const speakerName = form.speakerName.trim();
      const speakerTitle = form.speakerTitle.trim();
      const existingResource = this.editingResourceId
        ? this.resources.find((resource) => resource.id === this.editingResourceId)
        : undefined;
      const saved = await this.adminService.saveResource({
        id: this.editingResourceId ?? undefined,
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim(),
        url,
        ...(existingResource?.createdAt ? { createdAt: existingResource.createdAt } : {}),
        ...(sessionName ? { sessionName } : {}),
        ...(speakerName ? { speakerName } : {}),
        ...(speakerTitle ? { speakerTitle } : {}),
      });
      const index = this.resources.findIndex((resource) => resource.id === saved.id);
      const updatedList = index < 0
        ? [saved, ...this.resources]
        : this.resources.map((resource) => resource.id === saved.id ? saved : resource);
      this.resources = this.adminService.sortResourcesNewestFirst(updatedList);
      this.resourceNotice = `${saved.title} saved.`;
      this.cancelResourceEdit();
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      console.error('[AdminPage] Failed to save resource:', error);
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      this.resourceError = this.selectedResourceFile
        ? `Could not upload "${this.selectedResourceFile.name}"${detail}. For large presentation files, you can also upload to Google Drive / OneDrive and paste the HTTPS link above.`
        : 'Could not save this resource. Please try again.';
    } finally {
      if (this.resourceUploadAbortController === abortController) {
        this.resourceUploadAbortController = undefined;
      }
      this.isSavingResource = false;
      this.resourceUploadPercent = null;
      this.resourceUploadStatusText = '';
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
    return {
      title: '',
      type: 'Presentation' as ResourceType,
      description: '',
      url: '',
      sessionName: '',
      speakerName: '',
      speakerTitle: '',
    };
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
    this.clearProjectImageObjectUrls();
    this.projectImageItems = [];
    this.primaryProjectImageId = '';
    this.closeCountryPicker();
    this.projectError = '';
    this.projectNotice = '';
  }

  editProject(project: IconicProject): void {
    this.editingProjectId = project.id;
    this.isProjectFormOpen = true;
    const primaryUrl = (project.heroImage || project.assetUrl || '').trim();
    const rawUrls = Array.from(
      new Set(
        [
          primaryUrl,
          ...(Array.isArray(project.images) ? project.images : []),
          project.assetUrl ?? '',
          project.heroImage ?? '',
        ]
          .map((url) => url.trim())
          .filter(Boolean)
      )
    );
    this.clearProjectImageObjectUrls();
    this.projectImageItems =
      (project.assetType ?? 'image') === 'image'
        ? rawUrls.map((url, idx) => ({
            id: `existing-${idx}-${Date.now()}`,
            previewUrl: url,
            storedUrl: url,
            name: `Photo ${idx + 1}`,
          }))
        : [];
    this.primaryProjectImageId = this.projectImageItems[0]?.id ?? '';
    this.projectForm = {
      title: project.title ?? project.name,
      location: project.location ?? project.subtitle,
      order: Number.isFinite(Number(project.order)) && Number(project.order) > 0 ? Number(project.order) : 1,
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
    this.selectedProjectFile = null;
    this.clearProjectImageObjectUrls();
    this.projectImageItems = [];
    this.primaryProjectImageId = '';
    this.projectError = '';
    this.closeCountryPicker();
  }

  setPrimaryProjectImage(id: string): void {
    this.primaryProjectImageId = id;
    const item = this.projectImageItems.find((entry) => entry.id === id);
    if (item) {
      this.projectForm.assetUrl = item.storedUrl || item.previewUrl;
    }
  }

  removeProjectImage(id: string): void {
    const target = this.projectImageItems.find((entry) => entry.id === id);
    if (target?.file && target.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    this.projectImageItems = this.projectImageItems.filter((entry) => entry.id !== id);
    if (this.primaryProjectImageId === id) {
      this.primaryProjectImageId = this.projectImageItems[0]?.id ?? '';
    }
    const primary = this.projectImageItems.find((entry) => entry.id === this.primaryProjectImageId);
    this.projectForm.assetUrl = primary ? (primary.storedUrl || primary.previewUrl) : '';
  }

  private clearProjectImageObjectUrls(): void {
    for (const item of this.projectImageItems) {
      if (item.file && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  getProjectTextareaRows(value: string | undefined, minRows = 3): number {
    const text = value ?? '';
    if (!text) return minRows;
    const lines = text.split(/\r?\n/);
    const totalRows = lines.reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / 54)),
      0
    );
    return Math.max(minRows, totalRows);
  }

  async saveProject(): Promise<void> {
    const form = this.projectForm;
    if (!form.title.trim() || !form.country || !form.description.trim()) {
      this.projectError = 'Title, region, and description are required.';
      return;
    }
    const parsedOrder = Number(form.order);
    if (!Number.isFinite(parsedOrder) || parsedOrder < 1) {
      this.projectError = 'Order must be a valid number (1 or higher).';
      return;
    }
    if (form.assetType === 'image' && !this.projectImageItems.length && !form.assetUrl) {
      this.projectError = 'Upload at least one image before saving.';
      return;
    }
    if (form.assetType === 'model' && !this.selectedProjectFile && !form.assetUrl.trim()) {
      this.projectError = 'Provide a GLB/GLTF URL or upload a model before saving.';
      return;
    }
    this.isSavingProject = true;
    this.projectError = '';
    try {
      let assetUrl = '';
      let images: string[] = [];

      if (form.assetType === 'image') {
        const itemsToUpload = this.projectImageItems.length
          ? [...this.projectImageItems]
          : [
              {
                id: 'fallback-0',
                previewUrl: form.assetUrl.trim(),
                storedUrl: form.assetUrl.trim(),
                name: 'Photo 1',
              },
            ];
        // Put primary item first so images[0] and heroImage are always the marked primary photo
        itemsToUpload.sort((a, b) => {
          if (a.id === this.primaryProjectImageId) return -1;
          if (b.id === this.primaryProjectImageId) return 1;
          return 0;
        });

        const uploadedUrls: string[] = [];
        for (const item of itemsToUpload) {
          if (item.file) {
            const uploaded = await this.adminService.uploadProjectAsset(
              item.file,
              'image',
              form.title.trim()
            );
            uploadedUrls.push(uploaded);
          } else if (item.storedUrl) {
            const stored = await this.adminService.ensureProjectAssetStored(
              item.storedUrl,
              'image',
              form.title.trim()
            );
            uploadedUrls.push(stored);
          }
        }
        images = Array.from(new Set(uploadedUrls.filter(Boolean)));
        assetUrl = images[0] ?? '';
      } else {
        assetUrl = this.selectedProjectFile
          ? await this.adminService.uploadProjectAsset(
              this.selectedProjectFile,
              'model',
              form.title.trim()
            )
          : await this.adminService.ensureProjectAssetStored(
              form.assetUrl.trim(),
              'model',
              form.title.trim()
            );
      }

      const existingProject = this.editingProjectId
        ? this.projects.find((item) => item.id === this.editingProjectId)
        : undefined;

      const project: ProjectInput = {
        id: this.editingProjectId ?? undefined,
        title: form.title.trim(),
        location: form.location.trim(),
        name: form.title.trim(),
        subtitle: form.location.trim(),
        region: form.country === 'Egypt' ? 'egypt' : 'amea',
        country: form.country,
        countryCode: this.countryCode(form.country),
        coordinates: existingProject?.coordinates ?? { lat: 0, lng: 0 },
        heroImage: form.assetType === 'image' ? assetUrl : (existingProject?.heroImage ?? ''),
        images: form.assetType === 'image' ? images : (existingProject?.images ?? []),
        assetType: form.assetType,
        assetUrl,
        description: form.description.trim(),
        engineeringHighlight: form.highlights.map((highlight) => highlight.trim()).filter(Boolean)[0] ?? '',
        highlights: form.highlights.map((highlight) => highlight.trim()).filter(Boolean),
        stats: existingProject?.stats ?? {},
        products: existingProject?.products ?? [],
        tags: existingProject?.tags ?? [],
        order: parsedOrder,
      };
      if (form.assetType === 'model') {
        project.modelFormat = form.modelFormat;
      }
      const saved = await this.adminService.saveProject(project);
      const existingIndex = this.projects.findIndex((project) => project.id === saved.id);
      this.projects = existingIndex < 0
        ? [...this.projects, saved]
        : this.projects.map((project) => project.id === saved.id ? saved : project);
      this.projects.sort((a, b) => (a.order > 0 ? a.order : Number.MAX_SAFE_INTEGER) - (b.order > 0 ? b.order : Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
      this.editingProjectId = null;
      this.isProjectFormOpen = false;
      this.selectedProjectFile = null;
      this.clearProjectImageObjectUrls();
      this.projectImageItems = [];
      this.primaryProjectImageId = '';
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
    const nextOrder = this.projects?.length
      ? Math.max(0, ...this.projects.map((p) => Number(p.order) || 0)) + 1
      : 1;
    return {
      title: '',
      location: '',
      country: 'Egypt',
      order: nextOrder as number | string,
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
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) {
      return;
    }

    if (this.projectForm.assetType === 'image') {
      const invalidFile = files.find((file) => !file.type.startsWith('image/'));
      if (invalidFile) {
        this.projectError = 'Choose valid image files only.';
        input.value = '';
        return;
      }
      const newItems: ProjectImageItem[] = files.map((file, idx) => ({
        id: `new-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        previewUrl: URL.createObjectURL(file),
        file,
        name: file.name,
      }));
      this.projectImageItems = [...this.projectImageItems, ...newItems];
      if (!this.primaryProjectImageId && this.projectImageItems.length) {
        this.primaryProjectImageId = this.projectImageItems[0].id;
      }
      const primary = this.projectImageItems.find((entry) => entry.id === this.primaryProjectImageId);
      if (primary) {
        this.projectForm.assetUrl = primary.storedUrl || primary.previewUrl;
      }
      this.projectError = '';
      input.value = '';
      return;
    }

    const file = files[0];
    const isModel = /\.(glb|gltf)$/i.test(file.name);
    if (!isModel) {
      this.selectedProjectFile = null;
      this.projectError = 'Choose a .glb or .gltf model file.';
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
    return this.getAudienceRecipientCount(this.audienceKind, 'update');
  }

  private unusedLegacySelectedRecipientCount(): number | null {
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

  get groupNumberSegments(): AudienceSegment[] {
    return this.segments.filter((segment) => segment.field === 'group');
  }

  countRebrandingUsers(attending: boolean, pushReadyOnly = false): number {
    return this.attendees.filter(
      (attendee) =>
        Boolean(attendee.rebrandingEvent) === attending &&
        (!pushReadyOnly || attendee.hasPushToken)
    ).length;
  }

  countPlantVisitUsers(visiting: boolean, pushReadyOnly = false): number {
    return this.attendees.filter(
      (attendee) =>
        Boolean(attendee.plantVisit) === visiting &&
        (!pushReadyOnly || attendee.hasPushToken)
    ).length;
  }

  private unusedNotificationSegments(): AudienceSegment[] {
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
    const matched = this.getAudienceRecipients(audienceKind, context);
    if (!matched) {
      return null;
    }
    return pushReadyOnly
      ? matched.filter((attendee) => attendee.hasPushToken).length
      : matched.length;
  }

  private getAudienceRecipients(
    audienceKind: AudienceKind,
    context: AudienceContext
  ): AdminAttendee[] | null {
    if (!this.notificationAudience) {
      return null;
    }
    const kinds = this.getSelectedAudienceKinds(context);
    if (!kinds.length) {
      return [];
    }
    if (kinds.includes('all')) {
      return this.attendees;
    }
    const matchedMap = new Map<string, AdminAttendee>();
    for (const kind of kinds) {
      const list = this.getRecipientsForSingleKind(kind, context);
      if (list === null) {
        return null;
      }
      for (const attendee of list) {
        matchedMap.set(attendee.id, attendee);
      }
    }
    return [...matchedMap.values()];
  }

  private getRecipientsForSingleKind(
    audienceKind: AudienceKind,
    context: AudienceContext
  ): AdminAttendee[] | null {
    if (audienceKind === 'all') {
      return this.attendees;
    }
    if (audienceKind === 'users') {
      const selected = this.getAudienceSelectedUserIds(context);
      return selected.length
        ? this.attendees.filter((attendee) => selected.includes(attendee.id))
        : null;
    }
    if (audienceKind === 'group') {
      const selectedKeys =
        context === 'activity'
          ? this.activitySelectedSegmentKeys
          : this.selectedSegmentKeys;
      const groups = this.notificationSegments.filter((segment) =>
        selectedKeys.includes(segment.key)
      );
      return groups.length
        ? this.attendees.filter((attendee) =>
            groups.some((group) => this.matchesSegment(attendee, group))
          )
        : null;
    }
    if (audienceKind === 'groupNumber') {
      const selectedKeys =
        context === 'activity'
          ? this.activitySelectedGroupNumberKeys
          : this.selectedGroupNumberKeys;
      const groups = this.groupNumberSegments.filter((segment) =>
        selectedKeys.includes(segment.key)
      );
      return groups.length
        ? this.attendees.filter((attendee) =>
            groups.some((group) => this.matchesSegment(attendee, group))
          )
        : null;
    }
    if (audienceKind === 'plantVisitors') {
      const selectedVals =
        context === 'activity'
          ? this.activitySelectedPlantVisitValues
          : this.selectedPlantVisitValues;
      if (!selectedVals.length) {
        return null;
      }
      return this.attendees.filter((attendee) =>
        selectedVals.includes(attendee.plantVisit ? 'true' : 'false')
      );
    }
    if (audienceKind === 'nonPlantVisitors') {
      return this.attendees.filter((attendee) => !attendee.plantVisit);
    }
    if (audienceKind === 'rebrandingEvent') {
      const selectedVals =
        context === 'activity'
          ? this.activitySelectedRebrandingValues
          : this.selectedRebrandingValues;
      if (!selectedVals.length) {
        return null;
      }
      return this.attendees.filter((attendee) =>
        selectedVals.includes(attendee.rebrandingEvent ? 'true' : 'false')
      );
    }
    return this.attendees;
  }

  getSelectedAudienceKinds(context: AudienceContext): AudienceKind[] {
    return context === 'activity'
      ? this.activitySelectedAudienceKinds
      : this.selectedAudienceKinds;
  }

  isAudienceKindSelected(kind: AudienceKind, context: AudienceContext): boolean {
    return this.getSelectedAudienceKinds(context).includes(kind);
  }

  onAudienceKindChange(kind: AudienceKind, event: Event, context: AudienceContext): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    let current = [...this.getSelectedAudienceKinds(context)];
    if (kind === 'all') {
      current = checked ? ['all'] : [];
    } else if (checked) {
      current = [...current.filter((item) => item !== 'all' && item !== kind), kind];
      if (kind === 'group') {
        const firstKey = this.notificationSegments[0]?.key;
        if (firstKey) {
          if (context === 'activity' && !this.activitySelectedSegmentKeys.length) {
            this.activitySelectedSegmentKeys = [firstKey];
          } else if (context === 'update' && !this.selectedSegmentKeys.length) {
            this.selectedSegmentKeys = [firstKey];
          }
        }
      }
    } else {
      current = current.filter((item) => item !== kind);
    }
    if (!current.length) {
      current = ['all'];
    }
    if (context === 'activity') {
      this.activitySelectedAudienceKinds = current;
      this.activityAudienceKind = current[0];
    } else {
      this.selectedAudienceKinds = current;
      this.audienceKind = current[0];
    }
  }

  isSegmentSelected(key: string, context: AudienceContext): boolean {
    const keys = context === 'activity' ? this.activitySelectedSegmentKeys : this.selectedSegmentKeys;
    return keys.includes(key);
  }

  onSegmentChange(key: string, event: Event, context: AudienceContext): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const current = context === 'activity' ? this.activitySelectedSegmentKeys : this.selectedSegmentKeys;
    const next = checked ? [...new Set([...current, key])] : current.filter((k) => k !== key);
    if (context === 'activity') {
      this.activitySelectedSegmentKeys = next;
    } else {
      this.selectedSegmentKeys = next;
    }
  }

  selectAllSegments(context: AudienceContext): void {
    const allKeys = this.notificationSegments.map((s) => s.key);
    if (context === 'activity') {
      this.activitySelectedSegmentKeys = allKeys;
    } else {
      this.selectedSegmentKeys = allKeys;
    }
  }

  clearSelectedSegments(context: AudienceContext): void {
    if (context === 'activity') {
      this.activitySelectedSegmentKeys = [];
    } else {
      this.selectedSegmentKeys = [];
    }
  }

  isGroupNumberSelected(key: string, context: AudienceContext): boolean {
    const keys =
      context === 'activity' ? this.activitySelectedGroupNumberKeys : this.selectedGroupNumberKeys;
    return keys.includes(key);
  }

  onGroupNumberChange(key: string, event: Event, context: AudienceContext): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const current =
      context === 'activity' ? this.activitySelectedGroupNumberKeys : this.selectedGroupNumberKeys;
    const next = checked ? [...new Set([...current, key])] : current.filter((k) => k !== key);
    if (context === 'activity') {
      this.activitySelectedGroupNumberKeys = next;
    } else {
      this.selectedGroupNumberKeys = next;
    }
  }

  selectAllGroupNumbers(context: AudienceContext): void {
    const allKeys = this.groupNumberSegments.map((s) => s.key);
    if (context === 'activity') {
      this.activitySelectedGroupNumberKeys = allKeys;
    } else {
      this.selectedGroupNumberKeys = allKeys;
    }
  }

  clearSelectedGroupNumbers(context: AudienceContext): void {
    if (context === 'activity') {
      this.activitySelectedGroupNumberKeys = [];
    } else {
      this.selectedGroupNumberKeys = [];
    }
  }

  isRebrandingValueSelected(val: 'true' | 'false', context: AudienceContext): boolean {
    const vals =
      context === 'activity' ? this.activitySelectedRebrandingValues : this.selectedRebrandingValues;
    return vals.includes(val);
  }

  isPlantVisitValueSelected(val: 'true' | 'false', context: AudienceContext): boolean {
    const vals =
      context === 'activity' ? this.activitySelectedPlantVisitValues : this.selectedPlantVisitValues;
    return vals.includes(val);
  }

  onPlantVisitValueChange(val: 'true' | 'false', event: Event, context: AudienceContext): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const current =
      context === 'activity' ? this.activitySelectedPlantVisitValues : this.selectedPlantVisitValues;
    const next = checked ? [...new Set([...current, val])] : current.filter((v) => v !== val);
    if (context === 'activity') {
      this.activitySelectedPlantVisitValues = next;
    } else {
      this.selectedPlantVisitValues = next;
    }
  }

  onRebrandingValueChange(val: 'true' | 'false', event: Event, context: AudienceContext): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const current =
      context === 'activity' ? this.activitySelectedRebrandingValues : this.selectedRebrandingValues;
    const next = checked ? [...new Set([...current, val])] : current.filter((v) => v !== val);
    if (context === 'activity') {
      this.activitySelectedRebrandingValues = next;
    } else {
      this.selectedRebrandingValues = next;
    }
  }

  private unusedAudienceRecipientCount(audienceKind: AudienceKind, context: AudienceContext, pushReadyOnly = false): number | null {
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
        [attendee.name, attendee.email, attendee.id]
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

  get attendeesWithAccommodation(): AdminAttendee[] {
    return (this.dashboard?.attendees ?? []).filter((attendee) => attendee.accommodationDetails);
  }

  get attendeesWithCarDetails(): AdminAttendee[] {
    return (this.dashboard?.attendees ?? []).filter((attendee) => attendee.carDetails);
  }

  exportAttendees(): void {
    const headers = ['Name', 'Email', 'ID', 'Logged in', 'Active', 'Installed', 'Push ready'];
    const rows = this.filteredAttendees.map((attendee) => [
      attendee.name, attendee.email, attendee.id, attendee.loggedIn, attendee.active,
      attendee.installed, attendee.hasPushToken,
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
    return this.getAudienceRecipientCount(this.audienceKind, 'update', true);
  }

  private unusedLegacyPushReadyRecipientCount(): number | null {
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
      message: (scheduledAt
        ? `This will add the message to the selected attendees’ in-app inboxes and send push notifications to ${this.pushReadyRecipientCount} available device(s) at ${scheduledDisplay} Egypt time.`
        : `This will add the message to the selected attendees’ in-app inboxes and send push notifications to ${this.pushReadyRecipientCount} available device(s).`) +
        (this.highlightOnHome
          ? ' The message will also appear as an important banner on the recipients’ Home page until an admin removes it.'
          : ''),
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
      let result: NotificationSendResult;
      if (scheduledAt) {
        result = this.highlightOnHome
          ? await this.adminService.scheduleNotification(
              title,
              body,
              target,
              scheduledAt,
              true
            )
          : await this.adminService.scheduleNotification(
              title,
              body,
              target,
              scheduledAt
            );
      } else {
        result = this.highlightOnHome
          ? await this.adminService.sendNotification(title, body, target, true)
          : await this.adminService.sendNotification(title, body, target);
      }
      const resultMessage = this.notificationResultMessage(result, scheduledDisplay);
      this.notificationTitle = '';
      this.notificationBody = '';
      this.scheduledDateTime = '';
      if (result.status === 'failed') {
        this.errorMessage = resultMessage;
      } else if (this.highlightOnHome && result.homeHighlightActive !== true) {
        this.errorMessage =
          `${resultMessage} The notification was sent, but the banner was not activated by the backend. ` +
          'Deploy the updated notification functions, then use “Show on Home” in Recent updates.';
      } else {
        this.noticeMessage =
          resultMessage +
          (this.highlightOnHome
            ? result.status === 'scheduled'
              ? ' The Home banner will appear when the scheduled update is delivered.'
              : ' The Home banner is now active for recipients.'
            : '');
      }
      this.highlightOnHome = false;
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
      return `Notification scheduled for ${scheduledDisplay} Egypt time; ${result.inAppCount ?? result.targetCount} attendees will have it in their in-app inbox, with ${result.pushReadyCount} push-enabled.`;
    }
    return (
      `Notification saved to ${result.inAppCount ?? result.targetCount} in-app inbox(es); ` +
      `push ${result.status}: ${result.acceptedCount} accepted, ` +
      `${result.failedCount} failed; audience ${result.targetCount}, ` +
      `${result.pushReadyCount} push-enabled.`
    );
  }

  async removeHomeAnnouncement(announcement: AdminHomeAnnouncement): Promise<void> {
    const confirmation = await this.alertController.create({
      header: 'Remove Home announcement?',
      message: `“${announcement.title}” will disappear from recipients’ Home pages. The notification and campaign history will remain.`,
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

    try {
      await this.adminService.removeHomeAnnouncement(announcement.id);
      this.noticeMessage = 'The Home announcement was removed. Notification history was kept.';
      await this.loadDashboard(true);
    } catch (error) {
      console.error('[AdminPage] Failed to remove Home announcement:', error);
      this.errorMessage = 'The Home announcement could not be removed. Try again.';
    }
  }

  async activateHomeAnnouncement(campaign: AdminCampaign): Promise<void> {
    try {
      await this.adminService.activateHomeAnnouncement(campaign.id);
      this.noticeMessage = `“${campaign.title}” is now highlighted on Home for its recipients.`;
      await this.loadDashboard(true);
    } catch (error) {
      console.error('[AdminPage] Failed to activate Home announcement:', error);
      this.errorMessage = 'The update could not be highlighted on Home. Try again.';
    }
  }

  openRate(campaign: AdminCampaign): number {
    return campaign.inAppCount
      ? Math.round((campaign.openedCount / campaign.inAppCount) * 100)
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
    const title = this.activityTitle.trim() || this.activityQuestion.trim().slice(0, 120);
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
      this.activityError = 'Enter a question, at least two options, and a valid audience.';
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
        sessionName: this.activitySessionName ? this.activitySessionName.trim() : null,
        speakerName: this.activitySpeakerName ? this.activitySpeakerName.trim() : null,
        day: this.activityDay,
        scheduleLocked: this.activityScheduleLocked,
        correctOptionIndex:
          this.activityKind === 'quiz' ? this.correctOptionIndex : null,
      });
      this.activityTitle = '';
      this.activityQuestion = '';
      this.activityOptions = ['', ''];
      this.correctOptionIndex = 0;
      this.activitySessionName = '';
      this.activitySpeakerName = '';
      this.activityDay = null;
      this.activityScheduleLocked = true;
      this.activitySelectedUserIds = [];
      this.activityUserSearch = '';
      this.activitySelectedSegmentKey = '';
      this.activityNotice = `${this.activityKind === 'quiz' ? 'Quiz' : 'Poll'} published for attendees.`;
      if (result.notificationSummary?.deliveryError) {
        this.activityNotice += ' Inbox delivery also needs attention; attendees can still access it in the app.';
      } else if (result.notificationSummary?.pushReadyCount === 0) {
        this.activityNotice += ' The activity is saved in attendees’ in-app inboxes; no push tokens are available.';
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

  async setActivityActive(activity: AdminInteractiveActivity): Promise<void> {
    const active = !activity.active;
    if (activity.active) {
      const confirmation = await this.alertController.create({
        header: 'Close activity?',
        message: 'Attendees will no longer be able to submit a response. Existing responses will be kept.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Close activity', role: 'confirm' },
        ],
      });
      await confirmation.present();
      const { role } = await confirmation.onDidDismiss();
      if (role !== 'confirm') return;
    }

    this.updatingActivityId = activity.id;
    this.activityActionError = '';
    try {
      const result = await this.adminService.setInteractiveActivityActive(
        activity.id,
        active
      );
      activity.active = result.active;
    } catch (error) {
      console.error('[AdminPage] Failed to update activity status:', error);
      this.activityActionError = 'Could not update this activity. Please try again.';
    } finally {
      this.updatingActivityId = '';
    }
  }

  async loadAdminActivities(): Promise<void> {
    this.isLoadingActivities = true;
    void this.ensureAgendaSessionOptions();
    try {
      const result = await this.adminService.listAdminInteractiveActivities();
      this.adminActivities = result.activities;
      this.activityLoadError = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load quizzes and polls:', error);
      this.activityLoadError = 'Published quiz and poll results are unavailable.';
    } finally {
      this.isLoadingActivities = false;
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
    const activeKinds = this.getSelectedAudienceKinds(context);
    if (activeKinds.includes('all')) {
      return { kind: 'all' };
    }
    const matched = this.getAudienceRecipients(audienceKind, context);
    if (!matched || !matched.length) {
      return null;
    }
    const userIds = [...new Set(matched.map((attendee) => attendee.id))];
    return userIds.length ? { kind: 'users', userIds } : null;
  }

  private unusedOldGetAudienceTarget(
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
    const kinds = this.getSelectedAudienceKinds(context);
    if (kinds.includes('all')) {
      return { kind: 'all' };
    }
    const matched = this.getAudienceRecipients(audienceKind, context);
    if (!matched || !matched.length) {
      return null;
    }
    const userIds = [...new Set(matched.map((attendee) => attendee.id))];
    return userIds.length ? { kind: 'users', userIds } : null;
  }

  private unusedAudienceTarget(audienceKind: AudienceKind, context: AudienceContext, segmentKey: string): NotificationTarget | null {
    if (audienceKind === 'plantVisitors') {
      return { kind: 'segment', field: 'plantVisit', value: 'true' };
    }
    if (false) {
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
    const groupNumbers = new Set<string>([
      'group 1',
      'group 2',
      'group 3',
      'group 4',
      'group 5',
      'group 6',
      ...attendees
        .map((attendee) => this.normalizeGroupNumber(attendee.group ?? ''))
        .filter(Boolean),
    ]);
    for (const groupVal of groupNumbers) {
      const displayLabel = groupVal.replace(/^group\s+/i, 'Group ');
      segments.push({
        key: `group:${groupVal}`,
        field: 'group',
        value: groupVal,
        label: displayLabel,
      });
    }
    return segments.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  private normalizeGroupNumber(raw: string): string {
    const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return /^[1-6]$/.test(trimmed) ? `group ${trimmed}` : trimmed;
  }

  private unusedSortSegments(segments: AudienceSegment[]): AudienceSegment[] {
    return segments.sort((a, b) => a.label.localeCompare(b.label));
  }

  private matchesSegment(
    attendee: AdminAttendee,
    segment: AudienceSegment
  ): boolean {
    const values: Record<SegmentField, string> = {
      participantsGroup: attendee.participantsGroup,
      plantVisit: attendee.plantVisit ? 'true' : 'false',
      group: this.normalizeGroupNumber(attendee.group ?? ''),
      rebrandingEvent: attendee.rebrandingEvent ? 'true' : 'false',
    };
    return values[segment.field] === segment.value;
  }
}
