import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Auth } from '@angular/fire/auth';
import { AdminService, FlightDetails } from '../services/admin.service';

@Component({
  selector: 'app-journey',
  standalone: true,
  templateUrl: './journey.page.html',
  styleUrls: ['../more/more-module.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class JourneyPage {
  flightDetails: FlightDetails | null = null;
  isLoadingFlightDetails = true;

  constructor(
    private readonly auth: Auth,
    private readonly adminService: AdminService
  ) {
    void this.loadFlightDetails();
  }

  private async loadFlightDetails(): Promise<void> {
    try {
      await this.auth.authStateReady();
      this.flightDetails = await this.adminService.loadFlightDetails(
        this.auth.currentUser?.email ?? ''
      );
    } catch (error) {
      console.error('[JourneyPage] Failed to load flight details:', error);
    } finally {
      this.isLoadingFlightDetails = false;
    }
  }
}
