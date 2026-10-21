import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { IonContent } from "@ionic/angular/standalone";
import { IonicModule } from "@ionic/angular";

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class SplashPage implements OnInit {
  constructor(private router: Router, private authService: AuthService) {}

  async ngOnInit() {
    // Wait for Firebase to finish checking if user is signed in
    await this.authService.waitForAuthResolved();

    // Add a short visual delay
    setTimeout(async () => {
      if (this.authService.isAuthenticated()) {
        const allowed = await this.authService.isUserAllowed(this.authService.currentUser?.email);
        if (allowed) {
          this.router.navigateByUrl('/tabs', { replaceUrl: true });
        } else {
          await this.authService.logout();
          this.router.navigateByUrl('/login', { replaceUrl: true });
        }
      } else {
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    }, 1200);
  }

  
}
