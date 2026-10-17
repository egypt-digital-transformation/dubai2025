import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonButton,
  IonButtons,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { IconicProject } from '../models/project.model';

@Component({
  selector: 'app-project-detail-modal',
  standalone: true,
  templateUrl: './project-detail-modal.component.html',
  styleUrls: ['./project-detail-modal.component.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonIcon,
    IonButton,
    IonButtons,
    IonTitle,
    IonToolbar,
  ],
})
export class ProjectDetailModalComponent {
  @Input() project!: IconicProject;
  @Output() closeRequested = new EventEmitter<void>();

  close(): void {
    this.closeRequested.emit();
  }

  getDisplayStats(): { label: string; value: string; icon: string }[] {
    const stats: { label: string; value: string; icon: string }[] = [];

    if (this.project.stats.height) {
      stats.push({ label: 'Height', value: this.project.stats.height, icon: 'arrow-up-outline' });
    }
    if (this.project.stats.co2Reduction) {
      stats.push({ label: 'CO₂ Reduction', value: this.project.stats.co2Reduction, icon: 'leaf-outline' });
    }
    if (this.project.stats.concreteVolume) {
      stats.push({ label: 'Scale', value: this.project.stats.concreteVolume, icon: 'cube-outline' });
    }
    if (this.project.stats.customStats) {
      for (const s of this.project.stats.customStats) {
        stats.push({ label: s.label, value: s.value, icon: s.icon || 'information-circle-outline' });
      }
    }

    return stats;
  }
}
