import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import {
  AdminService,
  InteractiveActivity,
} from '../services/admin.service';

@Component({
  selector: 'app-activities',
  standalone: true,
  templateUrl: './activities.page.html',
  styleUrls: ['./activities.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ActivitiesPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);

  activities: InteractiveActivity[] = [];
  selectedOptions: Record<string, number | null> = {};
  submittingActivityId = '';
  isLoading = true;
  errorMessage = '';
  feedback: Record<string, string> = {};

  ngOnInit(): void {
    void this.loadActivities();
  }

  async loadActivities(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const result = await this.adminService.listInteractiveActivities();
      this.activities = result.activities;
    } catch (error) {
      console.error('[ActivitiesPage] Failed to load activities:', error);
      this.errorMessage = 'Could not load quizzes and polls. Please try again.';
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
