import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
@Component({ selector: 'app-requests', standalone: true, templateUrl: './requests.page.html', styleUrls: ['../more/more-module.page.scss'], imports: [CommonModule, FormsModule, IonicModule] })
export class RequestsPage {
  requestType = 'Transport';
  details = '';
  status = 'all';
  requests: { type: string; details: string; status: string }[] = [];

  get filteredRequests() {
    return this.status === 'all'
      ? this.requests
      : this.requests.filter((request) => request.status === this.status);
  }

  create(): void {
    if (this.details.trim()) {
      this.requests.unshift({
        type: this.requestType,
        details: this.details.trim(),
        status: 'Open',
      });
      this.details = '';
    }
  }
}
