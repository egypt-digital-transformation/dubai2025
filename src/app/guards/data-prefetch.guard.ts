import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { DataService } from '../services/data.service';

@Injectable({ providedIn: 'root' })
export class DataPrefetchGuard implements CanActivate {
  constructor(private dataService: DataService) {}

  async canActivate(): Promise<boolean> {
    try {
      await this.dataService.initData();
    } catch (error) {
      console.error('[DataPrefetchGuard] Failed to prefetch data:', error);
    }
    return true;
  }
}
