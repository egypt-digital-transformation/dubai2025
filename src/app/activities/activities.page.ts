import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import {
  AdminService,
  InteractiveActivity,
} from '../services/admin.service';

import { ActivitiesService, UserSessionTiming } from '../services/activities.service';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  sparklesOutline,
  checkmarkCircle,
  closeCircleOutline,
  radioButtonOn,
  checkmarkCircleOutline,
  helpCircleOutline,
  statsChartOutline,
  sendOutline,
  alertCircleOutline,
  calendarOutline,
  timeOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-activities',
  standalone: true,
  templateUrl: './activities.page.html',
  styleUrls: ['./activities.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ActivitiesPage implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly router = inject(Router);

  activities: InteractiveActivity[] = [];
  userSessionTimings: UserSessionTiming[] = [];
  selectedOptions: Record<string, number | null> = {};
  submittingActivityId = '';
  isLoading = true;
  errorMessage = '';
  feedback: Record<string, string> = {};
  private refreshTimer?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor() {
    addIcons({
      arrowBackOutline,
      sparklesOutline,
      checkmarkCircle,
      closeCircleOutline,
      radioButtonOn,
      checkmarkCircleOutline,
      helpCircleOutline,
      statsChartOutline,
      sendOutline,
      alertCircleOutline,
      calendarOutline,
      timeOutline,
    });
  }

  ngOnInit(): void {
    void this.loadActivities();
  }

  ionViewWillEnter(): void {
    void this.loadActivities();
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(() => {
        if (!this.isRefreshing) {
          void this.loadActivities(true);
        }
      }, 15_000);
    }
  }

  ionViewWillLeave(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
  }

  selectOption(activityId: string, optionIndex: number): void {
    if (this.submittingActivityId === activityId) {
      return;
    }
    this.selectedOptions[activityId] = optionIndex;
    if (this.feedback[activityId] === 'Choose an answer before submitting.') {
      this.feedback[activityId] = '';
    }
  }

  optionLetter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  optionPercentage(activity: InteractiveActivity, optionIndex: number): number {
    return activity.optionPercentages?.[optionIndex] ?? 0;
  }

  async doRefresh(event: any): Promise<void> {
    await this.loadActivities();
    event?.target?.complete?.();
  }

  async loadActivities(silent = false): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }
    try {
      // Parallelize fetching activities and user session timings
      const [fetchedActivities, timings] = await Promise.all([
        Promise.race([
          this.activitiesService.getActivities(),
          new Promise<InteractiveActivity[]>((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timed out. Please check your connection.')),
              12000
            )
          ),
        ]),
        this.activitiesService.getUserSessionTimings(),
      ]);

      this.userSessionTimings = timings;
      this.activities = fetchedActivities;
      this.errorMessage = '';
      // Mark all activities as seen since user is viewing the page
      this.activitiesService.markActivitiesAsSeen(this.activities);
    } catch (error: any) {
      console.error('[ActivitiesPage] Failed to load activities:', error);
      if (!silent && !this.activities.length) {
        this.errorMessage = error?.message?.includes('delegate profile')
          ? 'Delegate profile verification in progress. Please pull down to refresh.'
          : 'Could not load quizzes and polls. Please pull down to refresh.';
      }
    } finally {
      this.isRefreshing = false;
      if (!silent) this.isLoading = false;
    }
  }

  async submit(activity: InteractiveActivity): Promise<void> {
    const isUnlocked = this.activitiesService.isActivityScheduleUnlocked(
      activity,
      this.userSessionTimings
    ).isUnlocked;
    if (!isUnlocked) {
      this.feedback[activity.id] =
        'This activity is only available while your workshop session is live.';
      return;
    }

    const optionIndex = this.selectedOptions[activity.id];
    if (optionIndex === undefined || optionIndex === null || !Number.isInteger(optionIndex)) {
      this.feedback[activity.id] = 'Choose an answer before submitting.';
      return;
    }

    this.submittingActivityId = activity.id;
    this.feedback[activity.id] = '';
    try {
      const response = await this.adminService.submitInteractiveActivityResponse(
        activity.id,
        optionIndex
      );
      activity.submitted = true;
      activity.submittedOptionIndex = optionIndex;
      activity.isCorrect = response.isCorrect;
    } catch (error) {
      console.error('[ActivitiesPage] Failed to submit response:', error);
      this.feedback[activity.id] =
        'Your response could not be recorded. Please try again.';
    } finally {
      this.submittingActivityId = '';
    }
  }

  returnToApp(): void {
    void this.router.navigateByUrl('/tabs/home');
  }
}
