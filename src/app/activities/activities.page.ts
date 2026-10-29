import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import {
  AdminService,
  InteractiveActivity,
} from '../services/admin.service';

import { ActivitiesService } from '../services/activities.service';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  sparklesOutline,
  checkmarkCircle,
  radioButtonOn,
  checkmarkCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-activities',
  standalone: true,
  templateUrl: './activities.page.html',
  styleUrls: ['./activities.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ActivitiesPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly router = inject(Router);

  activities: InteractiveActivity[] = [];
  selectedOptions: Record<string, number | null> = {};
  submittingActivityId = '';
  isLoading = true;
  errorMessage = '';
  feedback: Record<string, string> = {};

  constructor() {
    addIcons({
      arrowBackOutline,
      sparklesOutline,
      checkmarkCircle,
      radioButtonOn,
      checkmarkCircleOutline,
    });
  }

  ngOnInit(): void {
    void this.loadActivities();
  }

  ionViewWillEnter(): void {
    void this.loadActivities();
  }

  async doRefresh(event: any): Promise<void> {
    await this.loadActivities();
    event?.target?.complete?.();
  }

  async loadActivities(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const fetchPromise = this.activitiesService.getActivities();
      const timeoutPromise = new Promise<InteractiveActivity[]>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timed out. Please check your connection.')),
          12000
        )
      );

      this.activities = await Promise.race([fetchPromise, timeoutPromise]);
      // Mark all activities as seen since user is viewing the page
      this.activitiesService.markActivitiesAsSeen(this.activities);
    } catch (error: any) {
      console.error('[ActivitiesPage] Failed to load activities:', error);
      if (!this.activities.length) {
        this.errorMessage = error?.message?.includes('delegate profile')
          ? 'Delegate profile verification in progress. Please pull down to refresh.'
          : 'Could not load quizzes and polls. Please pull down to refresh.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async submit(activity: InteractiveActivity): Promise<void> {
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
      this.feedback[activity.id] =
        activity.kind === 'quiz'
          ? response.isCorrect
            ? 'Correct answer. Thank you for responding!'
            : 'Thank you for responding. Check the correct answer with the event team.'
          : 'Your poll response has been recorded. Thank you!';
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
