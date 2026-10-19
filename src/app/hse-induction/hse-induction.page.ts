import { Component, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  AlertController,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { 
  closeOutline, 
  shieldCheckmarkOutline, 
  checkmarkCircleOutline, 
  alertCircleOutline, 
  peopleOutline, 
  checkmarkDoneOutline,
  informationCircle, handRightOutline, locationOutline } from 'ionicons/icons';

@Component({
  selector: 'app-hse-induction',
  standalone: true,
  templateUrl: './hse-induction.page.html',
  styleUrls: ['./hse-induction.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class HseInductionPage {
  @ViewChild('hseVideo', { static: false }) hseVideo!: ElementRef<HTMLVideoElement>;

  isComplete = false;
  lastTime = 0;
  watchProgress = 0; // Progress percentage (0-100)
  maxWatchedTime = 0; // Track the furthest point watched

  constructor(
    private router: Router,
    private alertCtrl: AlertController
  ) {
    addIcons({closeOutline,checkmarkCircleOutline,alertCircleOutline,peopleOutline,handRightOutline,locationOutline,shieldCheckmarkOutline,checkmarkDoneOutline,informationCircle});
  }

  onTimeUpdate() {
    const video = this.hseVideo.nativeElement;
    this.lastTime = video.currentTime;

    // Update max watched time (to prevent rewinding progress)
    if (video.currentTime > this.maxWatchedTime) {
      this.maxWatchedTime = video.currentTime;
    }

    // Calculate watch progress percentage
    if (video.duration > 0) {
      this.watchProgress = Math.round((this.maxWatchedTime / video.duration) * 100);
      
      // Ensure progress doesn't exceed 100%
      if (this.watchProgress > 100) {
        this.watchProgress = 100;
      }
    }
  }

  // Prevent skipping forward
  onSeekAttempt() {
    const video = this.hseVideo.nativeElement;
    
    // Allow seeking backwards, but not forward beyond watched content
    if (video.currentTime > this.maxWatchedTime + 2) {
      video.currentTime = this.maxWatchedTime;
      this.showNoSkippingAlert();
    } else {
      // Update lastTime for legitimate seeks
      this.lastTime = video.currentTime;
    }
  }

  async showNoSkippingAlert() {
    const alert = await this.alertCtrl.create({
      header: 'No Skipping Allowed',
      message: 'You must watch the entire video without skipping forward. You can rewind if needed.',
      buttons: ['OK'],
      cssClass: 'custom-alert'
    });
    await alert.present();
  }

  onVideoEnded() {
    this.isComplete = true;
    this.watchProgress = 100;
  }

  async markComplete() {
    if (!this.isComplete) {
      return;
    }

    // Store completion with timestamp
    const completionData = {
      completed: true,
      timestamp: new Date().toISOString(),
      duration: this.hseVideo.nativeElement.duration
    };
    
    localStorage.setItem('hseCompleted', JSON.stringify(completionData));

    // Show success message
    const alert = await this.alertCtrl.create({
      header: 'Induction Complete',
      message: 'Your HSE induction has been recorded. Stay safe!',
      buttons: ['Continue'],
      cssClass: 'success-alert'
    });
    
    await alert.present();
    await alert.onDidDismiss();

    // Navigate to home
    this.router.navigate(['tabs/home']);
  }

  async goHome() {
    // If video not complete, show confirmation
    if (!this.isComplete && this.watchProgress > 10) {
      const alert = await this.alertCtrl.create({
        header: 'Exit Induction?',
        message: 'You haven\'t completed the safety induction yet. Your progress will not be saved.',
        buttons: [
          {
            text: 'Continue Watching',
            role: 'cancel'
          },
          {
            text: 'Exit Anyway',
            role: 'destructive',
            handler: () => {
              this.router.navigate(['tabs/home']);
            }
          }
        ]
      });
      await alert.present();
    } else {
      // Just exit if barely started or already complete
      this.router.navigate(['tabs/home']);
    }
  }
}