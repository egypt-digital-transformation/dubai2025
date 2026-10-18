import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowBackOutline,
  downloadOutline,
  gridOutline,
  notificationsOutline,
  peopleOutline,
  refreshOutline,
  sendOutline,
  statsChartOutline,
} from 'ionicons/icons';
import { interval } from 'rxjs';
import { Router } from '@angular/router';
import {
  AdminAttendee,
  AdminCampaign,
  AdminDashboard,
  AdminInteractiveActivity,
  AdminService,
  NotificationTarget,
} from '../services/admin.service';

type SegmentField =
  | 'day2.group'
  | 'day3.type'
  | 'day3.groupAM'
  | 'day3.groupPM';

interface AudienceSegment {
  key: string;
  field: SegmentField;
  value: string;
  label: string;
}

interface EventReadinessItem {
  label: string;
  detail: string;
  status: 'ready' | 'attention';
}

type AdminSection = 'overview' | 'attendees' | 'engagement' | 'updates';
type UpdateMode = 'now' | 'scheduled';
type AttendeeStatusFilter = 'all' | 'active' | 'loggedIn' | 'installed' | 'pushReady';

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
  isLoading = true;
  isSending = false;
  errorMessage = '';
  noticeMessage = '';
  audienceKind: 'all' | 'user' | 'segment' = 'all';
  selectedUserId = '';
  selectedSegmentKey = '';
  notificationTitle = '';
  notificationBody = '';
  segments: AudienceSegment[] = [];
  activityKind: 'quiz' | 'poll' = 'quiz';
  activityTitle = '';
  activityQuestion = '';
  activityOptions = ['', ''];
  correctOptionIndex = 0;
  activityAudienceKind: 'all' | 'user' | 'segment' = 'all';
  activitySelectedUserId = '';
  activitySelectedSegmentKey = '';
  isCreatingActivity = false;
  activityNotice = '';
  activityError = '';
  showActivityResults: Record<string, boolean> = {};
  adminActivities: AdminInteractiveActivity[] = [];
  activityLoadError = '';
  selectedSection: AdminSection = 'overview';
  updateMode: UpdateMode = 'now';
  attendeeSearch = '';
  attendeeStatusFilter: AttendeeStatusFilter = 'all';

  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor() {
    addIcons({
      addOutline,
      arrowBackOutline,
      downloadOutline,
      gridOutline,
      notificationsOutline,
      peopleOutline,
      refreshOutline,
      sendOutline,
      statsChartOutline,
    });
  }

  returnToApp(): void {
    void this.router.navigateByUrl('/tabs/home');
  }

  selectSection(section: AdminSection): void {
    this.selectedSection = section;
  }

  onSectionTabKeydown(event: KeyboardEvent, currentSection: AdminSection): void {
    const sections: AdminSection[] = ['overview', 'attendees', 'engagement', 'updates'];
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
    void this.loadDashboard();
    void this.loadAdminActivities();
    this.refreshTimer = setInterval(() => {
      if (!this.isLoading && !this.isSending) {
        void this.loadDashboard(true);
      }
    }, 30_000);
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
      this.segments = this.buildSegments(this.dashboard.attendees);
      if (
        this.selectedSegmentKey &&
        !this.segments.some((segment) => segment.key === this.selectedSegmentKey)
      ) {
        this.selectedSegmentKey = '';
      }
      this.errorMessage = '';
    } catch (error) {
      console.error('[AdminPage] Failed to load dashboard:', error);
      this.errorMessage =
        'Could not load the admin dashboard. Check your connection and admin access, then try again.';
    } finally {
      this.isLoading = false;
    }
  }

  get selectedRecipientCount(): number | null {
    const attendees = this.dashboard?.attendees;
    if (!attendees) {
      return null;
    }
    if (this.audienceKind === 'all') {
      return attendees.length;
    }
    if (this.audienceKind === 'user') {
      return attendees.filter((attendee) => attendee.id === this.selectedUserId).length;
    }
    const segment = this.segments.find((item) => item.key === this.selectedSegmentKey);
    return segment
      ? attendees.filter((attendee) => this.matchesSegment(attendee, segment)).length
      : null;
  }

  get attendees(): AdminAttendee[] {
    return this.dashboard?.attendees ?? [];
  }

  get eventReadiness(): EventReadinessItem[] {
    const data = this.dashboard;
    if (!data) {
      return [];
    }

    const total = data.totalAttendees;
    return [
      {
        label: 'Delegate profiles',
        detail: `${total} profile${total === 1 ? '' : 's'} loaded`,
        status: total > 0 ? 'ready' : 'attention',
      },
      {
        label: 'Sign-in coverage',
        detail: `${data.totalLoggedIn} of ${total} signed in`,
        status: total > 0 && data.totalLoggedIn >= total ? 'ready' : 'attention',
      },
      {
        label: 'App install coverage',
        detail: `${data.installedUsers} of ${total} installed`,
        status: total > 0 && data.installedUsers >= total ? 'ready' : 'attention',
      },
      {
        label: 'Push delivery coverage',
        detail: `${data.pushReadyUsers} of ${total} push-enabled`,
        status: total > 0 && data.pushReadyUsers >= total ? 'ready' : 'attention',
      },
    ];
  }

  get filteredAttendees(): AdminAttendee[] {
    const query = this.attendeeSearch.trim().toLowerCase();
    return this.attendees.filter((attendee) => {
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
    const attendees = this.dashboard?.attendees;
    if (!attendees) {
      return null;
    }
    if (this.audienceKind === 'all') {
      return attendees.filter((attendee) => attendee.hasPushToken).length;
    }
    if (this.audienceKind === 'user') {
      return attendees.filter(
        (attendee) => attendee.id === this.selectedUserId && attendee.hasPushToken
      ).length;
    }
    const segment = this.segments.find((item) => item.key === this.selectedSegmentKey);
    return segment
      ? attendees.filter(
          (attendee) =>
            attendee.hasPushToken && this.matchesSegment(attendee, segment)
        ).length
      : null;
  }

  async sendNotification(): Promise<void> {
    if (this.updateMode !== 'now') {
      this.errorMessage =
        'Scheduling is not available. Choose “Publish now” when you are ready to send.';
      return;
    }
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

    const confirmation = await this.alertController.create({
      header: 'Send push notification?',
      message: `This will send the message to ${this.pushReadyRecipientCount} device(s).`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Send now', role: 'confirm' },
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
      const result = await this.adminService.sendNotification(title, body, target);
      this.notificationTitle = '';
      this.notificationBody = '';
      this.noticeMessage =
        `Notification ${result.status}: ${result.acceptedCount} accepted, ` +
        `${result.failedCount} failed; audience ${result.targetCount}, ` +
        `${result.pushReadyCount} push-enabled.`;
      await this.loadDashboard(true);
    } catch (error) {
      console.error('[AdminPage] Failed to send notification:', error);
      this.errorMessage =
        'The notification could not be sent. Review the selected audience and try again.';
    } finally {
      this.isSending = false;
    }
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
    if (!title || !question || options.some((option) => !option) || !target) {
      this.activityError = 'Enter a title, question, at least two options, and a valid audience.';
      return;
    }

    this.isCreatingActivity = true;
    this.activityError = '';
    this.activityNotice = '';
    try {
      await this.adminService.createInteractiveActivity({
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
      this.activityNotice = `${this.activityKind === 'quiz' ? 'Quiz' : 'Poll'} published for attendees.`;
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
    if (this.audienceKind === 'all') {
      return { kind: 'all' };
    }
    if (this.audienceKind === 'user' && this.selectedUserId) {
      return { kind: 'user', userId: this.selectedUserId };
    }
    const segment = this.segments.find((item) => item.key === this.selectedSegmentKey);
    return segment
      ? { kind: 'segment', field: segment.field, value: segment.value }
      : null;
  }

  private getActivityTarget(): NotificationTarget | null {
    if (this.activityAudienceKind === 'all') return { kind: 'all' };
    if (this.activityAudienceKind === 'user' && this.activitySelectedUserId) {
      return { kind: 'user', userId: this.activitySelectedUserId };
    }
    const segment = this.segments.find(
      (item) => item.key === this.activitySelectedSegmentKey
    );
    return segment
      ? { kind: 'segment', field: segment.field, value: segment.value }
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
    ];
    const segments: AudienceSegment[] = [];
    for (const item of fields) {
      const values = new Set(attendees.map(item.value).filter(Boolean));
      for (const value of values) {
        segments.push({
          key: `${item.field}:${value}`,
          field: item.field,
          value,
          label: `${item.label}: ${value}`,
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
    };
    return values[segment.field] === segment.value;
  }
}
