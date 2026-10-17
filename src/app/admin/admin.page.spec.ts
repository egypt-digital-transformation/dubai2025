import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { AdminDashboard, AdminService } from '../services/admin.service';
import { AdminPage } from './admin.page';

describe('AdminPage', () => {
  let fixture: ComponentFixture<AdminPage>;
  let component: AdminPage;
  let adminService: jasmine.SpyObj<AdminService>;

  const dashboard: AdminDashboard = {
    refreshedAt: new Date().toISOString(),
    totalAttendees: 2,
    totalLoggedIn: 1,
    activeLoggedIn: 1,
    installedUsers: 1,
    pushReadyUsers: 2,
    attendees: [
      {
        id: 'delegate-a',
        email: 'a@example.com',
        name: 'Delegate A',
        day2Group: '1',
        day3Type: 'SV',
        day3GroupAM: '',
        day3GroupPM: '',
        hasPushToken: true,
        loggedIn: true,
        active: true,
        installed: true,
      },
      {
        id: 'delegate-b',
        email: 'b@example.com',
        name: 'Delegate B',
        day2Group: '2',
        day3Type: 'WS',
        day3GroupAM: '3',
        day3GroupPM: '',
        hasPushToken: true,
        loggedIn: false,
        active: false,
        installed: false,
      },
    ],
    campaigns: [],
  };

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>('AdminService', [
      'loadDashboard',
      'sendNotification',
      'listAdminInteractiveActivities',
      'createInteractiveActivity',
    ]);
    adminService.loadDashboard.and.resolveTo(dashboard);
    adminService.listAdminInteractiveActivities.and.resolveTo({ activities: [] });
    adminService.createInteractiveActivity.and.resolveTo({ id: 'activity-1' });
    adminService.sendNotification.and.resolveTo({
      campaignId: 'campaign-1',
      targetCount: 1,
      pushReadyCount: 1,
      acceptedCount: 1,
      failedCount: 0,
      status: 'complete',
    });

    const alert = {
      present: jasmine.createSpy().and.resolveTo(undefined),
      onDidDismiss: jasmine.createSpy().and.resolveTo({ role: 'confirm' }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [
        { provide: AdminService, useValue: adminService },
        {
          provide: AlertController,
          useValue: { create: jasmine.createSpy().and.resolveTo(alert) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadDashboard();
  });

  afterEach(() => fixture.destroy());

  it('builds group targeting options from the delegate profiles', () => {
    expect(component.segments).toContain(
      jasmine.objectContaining({
        field: 'day2.group',
        value: '1',
        label: 'Day 2 group: 1',
      })
    );
    expect(component.segments).toContain(
      jasmine.objectContaining({
        field: 'day3.type',
        value: 'SV',
        label: 'Day 3 track/type: SV',
      })
    );
  });

  it('sends to the selected segment after confirmation', async () => {
    component.audienceKind = 'segment';
    component.selectedSegmentKey = 'day2.group:1';
    component.notificationTitle = 'Schedule update';
    component.notificationBody = 'The session location changed.';

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Schedule update',
      'The session location changed.',
      { kind: 'segment', field: 'day2.group', value: '1' }
    );
  });

  it('publishes a quiz to the selected audience segment', async () => {
    component.activityTitle = 'Safety check';
    component.activityQuestion = 'Which item protects your eyes?';
    component.activityOptions = ['Safety glasses', 'Open sandals'];
    component.correctOptionIndex = 0;
    component.activityAudienceKind = 'segment';
    component.activitySelectedSegmentKey = 'day2.group:1';

    await component.createInteractiveActivity();

    expect(adminService.createInteractiveActivity).toHaveBeenCalledWith({
      title: 'Safety check',
      question: 'Which item protects your eyes?',
      options: ['Safety glasses', 'Open sandals'],
      kind: 'quiz',
      target: { kind: 'segment', field: 'day2.group', value: '1' },
      correctOptionIndex: 0,
    });
  });

  it('keeps campaign and quiz/poll composers visible when dashboard data is unavailable', () => {
    component.dashboard = null;
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Targeted push notifications');
    expect(pageText).toContain('Create a quiz or poll');
    expect(pageText).toContain('All attendees');
  });
});
