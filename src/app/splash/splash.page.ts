import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { IonContent } from "@ionic/angular/standalone";
import { IonicModule } from "@ionic/angular";

const SPLASH_DURATION_MS = 10_000;

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
    await Promise.all([
      this.authService.waitForAuthResolved(),
      new Promise<void>((resolve) => setTimeout(resolve, SPLASH_DURATION_MS)),
    ]);

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
  }

}
