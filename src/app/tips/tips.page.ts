import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  closeOutline,
  shirtOutline,
  cashOutline,
  flashOutline,
  partlySunnyOutline,
  medkitOutline,
  compassOutline,
  restaurantOutline,
  businessOutline,
  timeOutline,
  checkmarkCircleOutline,
  locationOutline,
  sparklesOutline,
  informationCircleOutline,
  calendarOutline,
  layersOutline,
  carOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-tips',
  templateUrl: './tips.page.html',
  styleUrls: ['./tips.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
})
export class TipsPage implements OnInit {
  activeTab: 'essential' | 'explore' = 'essential';

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      arrowBackOutline,
      closeOutline,
      shirtOutline,
      cashOutline,
      flashOutline,
      partlySunnyOutline,
      medkitOutline,
      compassOutline,
      restaurantOutline,
      businessOutline,
      timeOutline,
      checkmarkCircleOutline,
      locationOutline,
      sparklesOutline,
      informationCircleOutline,
      calendarOutline,
      carOutline,
    });
  }

  ngOnInit(): void {}

  setTab(tab: 'essential' | 'explore'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  goHome(): void {
    void this.router.navigate(['tabs/home']);
  }
}
