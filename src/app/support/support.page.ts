import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { callOutline, logoWhatsapp } from 'ionicons/icons';

@Component({
  selector: 'app-support',
  standalone: true,
  templateUrl: './support.page.html',
  styleUrls: ['../more/more-module.page.scss', './support.page.scss'],
  imports: [IonicModule],
})
export class SupportPage {
  constructor() {
    addIcons({
      callOutline,
      logoWhatsapp,
    });
  }
}
