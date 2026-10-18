import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
@Component({ selector: 'app-networking', standalone: true, templateUrl: './networking.page.html', styleUrls: ['../more/more-module.page.scss'], imports: [FormsModule, IonicModule] })
export class NetworkingPage { sharing = false; search = ''; }
