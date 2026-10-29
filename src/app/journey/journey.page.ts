import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import {
  airplaneOutline,
  bedOutline,
  businessOutline,
  calendarOutline,
  checkmarkCircleOutline,
  keyOutline,
  layersOutline,
  locationOutline,
  timeOutline,
} from 'ionicons/icons';
import { AccommodationDetails, AdminService, FlightDetails, FlightLeg } from '../services/admin.service';
import { AdminPreviewService } from '../services/admin-preview.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-journey',
  standalone: true,
  templateUrl: './journey.page.html',
  styleUrls: ['./journey.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class JourneyPage implements OnInit, OnDestroy {
  flightDetails: FlightDetails | null = null;
  accommodationDetails: AccommodationDetails | null = null;
  isLoadingFlightDetails = true;
  isLoadingAccommodationDetails = true;
  private previewSubscription?: Subscription;
  private loadGeneration = 0;

  constructor(
    private readonly auth: Auth,
    private readonly adminService: AdminService,
    private readonly adminPreview: AdminPreviewService
  ) {
    addIcons({
      airplaneOutline,
      bedOutline,
      businessOutline,
      calendarOutline,
      checkmarkCircleOutline,
      keyOutline,
      layersOutline,
      locationOutline,
      timeOutline,
    });
  }

  ngOnInit(): void {
    this.previewSubscription = this.adminPreview.selectedUser$.subscribe((previewUser) => {
      void this.loadJourneyDetails(previewUser?.email);
    });
  }

  ngOnDestroy(): void {
    this.previewSubscription?.unsubscribe();
  }

  hasAirport(leg?: FlightLeg | null): boolean {
    if (!leg) return false;
    return Boolean(leg.departureAirport?.trim() || leg.arrivalAirport?.trim());
  }

  formatAirportRoute(leg?: FlightLeg | null): string {
    if (!leg) return '';
    const dep = leg.departureAirport?.trim();
    const arr = leg.arrivalAirport?.trim();
    if (dep && arr && dep.toLowerCase() !== arr.toLowerCase()) {
      return `${dep} → ${arr}`;
    }
    return arr || dep || '';
  }

  formatFlightDate(raw?: string): string {
    const value = raw?.trim();
    if (!value) return 'To be confirmed';
    const parsed = this.parseFlexibleDate(value);
    if (!parsed) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  formatFlightTime(raw?: string): string {
    const value = raw?.trim();
    if (!value) return 'To be confirmed';
    // Strip seconds from "8:00:00 AM" -> "8:00 AM"
    const amPmMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (amPmMatch) {
      return `${Number(amPmMatch[1])}:${amPmMatch[2]} ${amPmMatch[3].toUpperCase()}`;
    }
    // Convert 24h "15:00:00" or "15:00" -> "3:00 PM"
    const time24Match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (time24Match) {
      const hours24 = Number(time24Match[1]);
      const minutes = time24Match[2];
      if (hours24 >= 0 && hours24 < 24) {
        const period = hours24 >= 12 ? 'PM' : 'AM';
        const hours12 = hours24 % 12 || 12;
        return `${hours12}:${minutes} ${period}`;
      }
    }
    return value;
  }

  formatStayDate(raw?: string): string {
    const value = raw?.trim();
    if (!value) return 'To be confirmed';
    const parsed = this.parseFlexibleDate(value);
    if (!parsed) {
      return value.split(' ')[0] || value;
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  formatStayTime(raw?: string): string {
    const value = raw?.trim();
    if (!value) return '';
    const parts = value.split(/\s+/);
    if (parts.length >= 2) {
      return this.formatFlightTime(parts.slice(1).join(' '));
    }
    const parsed = this.parseFlexibleDate(value);
    if (parsed && /T\d{2}:\d{2}/.test(value)) {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(parsed);
    }
    return '';
  }

  private parseFlexibleDate(value: string): Date | null {
    // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
    const isoLike = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoLike) {
      const year = Number(isoLike[1]);
      const month = Number(isoLike[2]) - 1;
      const day = Number(isoLike[3]);
      const hour = Number(isoLike[4] ?? 0);
      const minute = Number(isoLike[5] ?? 0);
      const second = Number(isoLike[6] ?? 0);
      const date = new Date(year, month, day, hour, minute, second);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    // Handle "MM/DD/YYYY"
    const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const month = Number(slashMatch[1]) - 1;
      const day = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      const date = new Date(year, month, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  private async loadJourneyDetails(previewEmail?: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.isLoadingFlightDetails = true;
    this.isLoadingAccommodationDetails = true;
    this.flightDetails = null;
    this.accommodationDetails = null;
    try {
      await this.auth.authStateReady();
      const email =
        previewEmail ??
        this.adminPreview.selectedUser?.email ??
        this.auth.currentUser?.email ??
        '';
      const [flightDetails, accommodationDetails] = await Promise.all([
        this.adminService.loadFlightDetails(email).catch((error) => {
          console.error('[JourneyPage] Failed to load flight details:', error);
          return null;
        }),
        this.adminService.loadAccommodationDetails(email).catch((error) => {
          console.error('[JourneyPage] Failed to load accommodation details:', error);
          return null;
        }),
      ]);
      if (generation === this.loadGeneration) {
        this.flightDetails = flightDetails;
        this.accommodationDetails = accommodationDetails;
      }
    } catch (error) {
      console.error('[JourneyPage] Failed to load journey details:', error);
    } finally {
      if (generation === this.loadGeneration) {
        this.isLoadingFlightDetails = false;
        this.isLoadingAccommodationDetails = false;
      }
    }
  }
}
