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

  it('keeps the update composer available and explains unavailable audience data', () => {
    component.dashboard = null;
    component.selectedSection = 'updates';
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Publish an update');
    expect(pageText).toContain('All attendees');
    expect(pageText).toContain('Audience details are unavailable');

    component.selectSection('engagement');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create a quiz or poll');
  });

  it('opens the overview by default and renders one admin workspace at a time', () => {
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    expect(component.selectedSection).toBe('overview');
    expect(page.querySelector('#admin-tab-overview')?.getAttribute('aria-selected')).toBe('true');
    expect(page.querySelector('#overview')).not.toBeNull();
    expect(page.querySelector('#notifications')).toBeNull();
    expect(page.querySelector('#engagement')).toBeNull();
    expect(page.querySelector('.metric-definition')?.textContent).toContain('15 minutes');
  });

  it('switches workspaces from the horizontal tabs without navigating away', () => {
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    page.querySelector<HTMLButtonElement>(
      '#admin-tab-updates'
    )?.click();
    fixture.detectChanges();

    expect(component.selectedSection).toBe('updates');
    expect(page.querySelector('#admin-tab-updates')?.getAttribute('aria-selected')).toBe('true');
    expect(page.querySelector('#notifications')).not.toBeNull();
    expect(page.querySelector('#campaigns')).not.toBeNull();
    expect(page.querySelector('#engagement')).toBeNull();
    expect(page.querySelector('.admin-section-nav a')).toBeNull();

    page.querySelector<HTMLButtonElement>('#admin-tab-engagement')?.click();
    fixture.detectChanges();

    expect(component.selectedSection).toBe('engagement');
    expect(page.querySelector('#notifications')).toBeNull();
    expect(page.querySelector('#engagement')).not.toBeNull();
    expect(page.textContent).toContain('Published quizzes and polls');
  });

  it('presents recent update reporting guidance', () => {
    component.selectedSection = 'updates';
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('Recent updates');
    expect(page.textContent).toContain('Accepted” means Firebase accepted the send request');
    expect(page.textContent).toContain('Opens count unique recipients');
  });

  it('supports arrow-key navigation between admin tabs', () => {
    fixture.detectChanges();
    const tab = fixture.nativeElement.querySelector('#admin-tab-overview') as HTMLButtonElement;
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    tab.dispatchEvent(event);
    fixture.detectChanges();

    expect(component.selectedSection).toBe('attendees');
    expect(document.activeElement?.id).toBe('admin-tab-attendees');
    expect(fixture.nativeElement.querySelector('#attendees')).not.toBeNull();
  });

  it('filters attendees by search text and status', () => {
    component.selectedSection = 'attendees';
    component.attendeeSearch = 'b@example.com';
    component.attendeeStatusFilter = 'installed';
    fixture.detectChanges();

    expect(component.filteredAttendees.map((attendee) => attendee.id)).toEqual([]);
    component.attendeeStatusFilter = 'all';
    fixture.detectChanges();
    expect(component.filteredAttendees.map((attendee) => attendee.id)).toEqual(['delegate-b']);
  });

  it('exports the currently filtered attendees as CSV', () => {
    component.selectedSection = 'attendees';
    component.attendeeSearch = 'delegate-a';
    const createObjectUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    const revokeObjectUrl = spyOn(URL, 'revokeObjectURL');
    const click = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({
      click,
    } as unknown as HTMLAnchorElement);

    component.exportAttendees();

    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });

  it('shows activity lifecycle status without offering unsupported close persistence', async () => {
    adminService.listAdminInteractiveActivities.and.resolveTo({
      activities: [
        {
          id: 'open-activity',
          title: 'Open check',
          question: 'Question?',
          options: ['Yes', 'No'],
          kind: 'poll',
          active: true,
          target: { kind: 'all' },
          responseCount: 1,
          optionCounts: [1, 0],
          correctCount: null,
        },
        {
          id: 'closed-activity',
          title: 'Closed check',
          question: 'Question?',
          options: ['A', 'B'],
          kind: 'quiz',
          active: false,
          target: { kind: 'all' },
          responseCount: 2,
          optionCounts: [1, 1],
          correctCount: 1,
        },
      ],
    });

    await component.loadAdminActivities();
    component.selectedSection = 'engagement';
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Activity lifecycle controls unavailable');
    expect(pageText).toContain('Closing an activity is not supported');
    expect(fixture.nativeElement.querySelectorAll('.status-badge').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.status-badge')?.textContent).toContain('Open');
    expect(fixture.nativeElement.querySelector('.status-badge-closed')?.textContent).toContain('Closed');
    expect(pageText).not.toContain('Close activity');
  });
});
