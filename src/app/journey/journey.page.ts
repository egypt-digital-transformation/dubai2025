import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Auth } from '@angular/fire/auth';
import { AdminService, FlightDetails } from '../services/admin.service';
import { AdminPreviewService } from '../services/admin-preview.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-journey',
  standalone: true,
  templateUrl: './journey.page.html',
  styleUrls: ['../more/more-module.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class JourneyPage implements OnInit, OnDestroy {
  flightDetails: FlightDetails | null = null;
  isLoadingFlightDetails = true;
  private previewSubscription?: Subscription;
  private loadGeneration = 0;

  constructor(
    private readonly auth: Auth,
    private readonly adminService: AdminService,
    private readonly adminPreview: AdminPreviewService
  ) {}

  ngOnInit(): void {
    this.previewSubscription = this.adminPreview.selectedUser$.subscribe((previewUser) => {
      void this.loadFlightDetails(previewUser?.email ?? this.auth.currentUser?.email ?? '');
    });
  }

  ngOnDestroy(): void {
    this.previewSubscription?.unsubscribe();
  }

  private async loadFlightDetails(email: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.isLoadingFlightDetails = true;
    this.flightDetails = null;
    try {
      await this.auth.authStateReady();
      const details = await this.adminService.loadFlightDetails(email);
      if (generation === this.loadGeneration) {
        this.flightDetails = details;
      }
    } catch (error) {
      console.error('[JourneyPage] Failed to load flight details:', error);
    } finally {
      if (generation === this.loadGeneration) {
        this.isLoadingFlightDetails = false;
      }
    }
  }
}
