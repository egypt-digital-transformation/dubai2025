import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonCard, IonCardContent, IonIcon, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mapOutline, chevronForwardOutline } from 'ionicons/icons';
import { closeOutline } from 'ionicons/icons';
import { Router } from '@angular/router';

interface Location {
  icon: string;
  name: string;
  desc: string;
}

interface Room {
  name: string;
  subtitle: string;
  color: string;
  type: 'hall' | 'room';
}

@Component({
  selector: 'app-venue',
  templateUrl: './venue.page.html',
  styleUrls: ['./venue.page.scss'],
  standalone: true,
imports: [
  CommonModule,
  IonContent,
  IonButton,
  IonCard,
  IonCardContent,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
]
})
export class VenuePage {
  halls: Room[] = [
    { name: 'Hall A', subtitle: 'Main Stage', color: 'var(--holcim-bright-green)', type: 'hall' },
    { name: 'Hall B', subtitle: 'Breakouts', color: 'var(--holcim-bright-blue)', type: 'hall' }
  ];

  rooms: Room[] = [
    { name: 'Room 1', subtitle: '', color: 'var(--holcim-dark-blue)', type: 'room' },
    { name: 'Room 2', subtitle: '', color: 'var(--holcim-dark-blue)', type: 'room' },
    { name: 'Room 3', subtitle: '', color: 'var(--holcim-dark-blue)', type: 'room' }
  ];

  locations: Location[] = [
    { icon: '🎤', name: 'Hall A - Main Stage', desc: 'Keynotes & plenary sessions' },
    { icon: '💼', name: 'Breakout Rooms 1-6', desc: 'Second floor' },
    { icon: '☕', name: 'Networking Lounge', desc: 'Refreshments & casual meetings' },
    { icon: '🎪', name: 'Exhibition Area', desc: 'Sponsor booths & demos' }
  ];

constructor(private router: Router) {
  addIcons({ mapOutline, chevronForwardOutline, closeOutline });
}


  onRoomClick(room: Room): void {
    console.log('Room clicked:', room.name);
    // Implement navigation or modal logic here
  }

  onLocationClick(location: Location): void {
    console.log('Location clicked:', location.name);
    // Implement navigation or modal logic here
  }

  closeVenue() {
  this.router.navigate(['tabs/home']);
}

}
