import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { businessOutline, closeOutline, constructOutline } from 'ionicons/icons';

export type SafetyInductionSite = 'sokhnaplant' | 'rmx';

export interface SafetyInduction {
  completed: boolean;
  link: string;
}

export type SafetyInductions = Record<SafetyInductionSite, SafetyInduction>;

@Component({
  selector: 'app-safety-induction-modal',
  standalone: true,
  templateUrl: './safety-induction-modal.component.html',
  styleUrls: ['./safety-induction-modal.component.scss'],
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
  ],
})
export class SafetyInductionModalComponent {
  @Input({ required: true }) safetyInductions!: SafetyInductions;
  @Input() rmxRequired = true;
  @Input() completedCount = 0;
  @Input() totalRequired = 2;

  constructor(private modalController: ModalController) {
    addIcons({ businessOutline, closeOutline, constructOutline });
  }

  navigateToSite(site: SafetyInductionSite): void {
    void this.modalController.dismiss({ site });
  }

  close(): void {
    void this.modalController.dismiss();
  }
}
