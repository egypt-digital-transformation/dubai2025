import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { vi } from 'vitest';
import { AdminDashboard, AdminService } from '../../src/app/services/admin.service';
import { AdminPage } from '../../src/app/admin/admin.page';

describe('AdminPage', () => {
  let fixture: ComponentFixture<AdminPage>;
  let component: AdminPage;
  let adminService: ReturnType<typeof createAdminServiceMock>;

  const createAdminServiceMock = () => ({
    loadDashboard: vi.fn<AdminService['loadDashboard']>(),
    loadNotificationAudience: vi.fn<AdminService['loadNotificationAudience']>(),
    loadFlightDetailsForAttendees: vi.fn<AdminService['loadFlightDetailsForAttendees']>(),
    loadSafetyInductionStatus: vi.fn<AdminService['loadSafetyInductionStatus']>(),
    sendNotification: vi.fn<AdminService['sendNotification']>(),
    scheduleNotification: vi.fn<AdminService['scheduleNotification']>(),
    listAdminInteractiveActivities: vi.fn<AdminService['listAdminInteractiveActivities']>(),
    createInteractiveActivity: vi.fn<AdminService['createInteractiveActivity']>(),
    loadAdminRequests: vi.fn<AdminService['loadAdminRequests']>(),
    updateAdminRequest: vi.fn<AdminService['updateAdminRequest']>(),
  });

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
        firstName: 'Delegate',
        nationality: 'Egyptian',
        participantsGroup: 'Leadership',
        hasPushToken: true,
        loggedIn: true,
        active: true,
        installed: true,
        plantVisit: true,
      },
      {
        id: 'delegate-b',
        email: 'b@example.com',
        name: 'Delegate B',
        firstName: 'Delegate',
        nationality: 'Egyptian',
        participantsGroup: 'Operations',
        hasPushToken: true,
        loggedIn: false,
        active: false,
        installed: false,
        plantVisit: false,
      },
    ],
    campaigns: [],
  };

  beforeEach(async () => {
    adminService = createAdminServiceMock();
    adminService.loadDashboard.mockResolvedValue(dashboard);
    adminService.loadNotificationAudience.mockResolvedValue(dashboard.attendees);
    adminService.loadFlightDetailsForAttendees.mockResolvedValue(dashboard.attendees);
    adminService.loadSafetyInductionStatus.mockResolvedValue(dashboard.attendees);
    adminService.loadAdminRequests.mockResolvedValue([]);
    adminService.updateAdminRequest.mockResolvedValue(undefined);
    adminService.listAdminInteractiveActivities.mockResolvedValue({ activities: [] });
    adminService.createInteractiveActivity.mockResolvedValue({ id: 'activity-1' });
    adminService.sendNotification.mockResolvedValue({
      campaignId: 'campaign-1',
      targetCount: 1,
      pushReadyCount: 1,
      acceptedCount: 1,
      failedCount: 0,
      status: 'complete',
    });
    adminService.scheduleNotification.mockResolvedValue({
      campaignId: 'campaign-scheduled',
      targetCount: 2,
      pushReadyCount: 2,
      acceptedCount: 0,
      failedCount: 0,
      status: 'scheduled',
      scheduledAt: '2026-12-01T10:30:00.000Z',
    });

    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [
        { provide: AdminService, useValue: adminService },
        {
          provide: AlertController,
          useValue: { create: vi.fn().mockResolvedValue(alert) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadDashboard();
    await component.loadNotificationAudience();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  it('builds targeting options from the delegate profiles', () => {
    expect(component.notificationSegments.map((segment) => segment.label)).toEqual([
      'Participants group: Leadership',
      'Participants group: Operations',
    ]);
    expect(component.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'participantsGroup',
        value: 'Leadership',
        label: 'Participants group: Leadership',
      }),
    ]));
    expect(component.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'plantVisit',
        value: 'true',
        label: 'Plant visitors',
      }),
    ]));
  });

  it('loads the notification audience independently from Firestore', async () => {
    await component.loadNotificationAudience();

    expect(adminService.loadNotificationAudience).toHaveBeenCalled();
    expect(component.attendees.map((attendee) => attendee.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect(component.pushReadyRecipientCount).toBe(2);
  });

  it('shows flight records from dashboard attendees, not notification audience', () => {
    const flightDetails = {
      inbound: {
        arrivalAirport: 'CAI',
        arrivalDate: '2026-11-09',
        arrivalTime: '10:00',
        departureAirport: 'DXB',
        departureDate: '2026-11-09',
        departureTime: '07:00',
        flightNo: 'TEST123',
      },
      outbound: {
        arrivalAirport: 'DXB',
        arrivalDate: '2026-11-12',
        arrivalTime: '18:00',
        departureAirport: 'CAI',
        departureDate: '2026-11-12',
        departureTime: '15:00',
        flightNo: 'TEST456',
      },
    };
    component.dashboard = {
      ...dashboard,
      attendees: [{ ...dashboard.attendees[0], flightDetails }],
    };
    component.notificationAudience = [dashboard.attendees[1]];

    expect(component.attendeesWithFlights).toEqual([
      { ...dashboard.attendees[0], flightDetails },
    ]);
  });

  it('sends to any number of individually selected users', async () => {
    component.audienceKind = 'users';
    component.selectedUserIds = ['delegate-a', 'delegate-b'];
    component.notificationTitle = 'Important update';
    component.notificationBody = 'Please read this update.';

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Important update',
      'Please read this update.',
      { kind: 'users', userIds: ['delegate-a', 'delegate-b'] }
    );
  });

  it('saves notifications for selected users even when no push token is available', async () => {
    component.audienceKind = 'users';
    component.selectedUserIds = ['delegate-a'];
    component.notificationAudience = [
      { ...dashboard.attendees[0], hasPushToken: false },
    ];
    component.notificationTitle = 'Important update';
    component.notificationBody = 'Please read this update.';
    adminService.sendNotification.mockResolvedValue({
      campaignId: 'campaign-in-app',
      targetCount: 1,
      pushReadyCount: 0,
      inAppCount: 1,
      acceptedCount: 0,
      failedCount: 0,
      status: 'in_app',
    });

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Important update',
      'Please read this update.',
      { kind: 'users', userIds: ['delegate-a'] }
    );
    expect(component.errorMessage).toBe('');
    expect(component.noticeMessage).toContain('1 in-app inbox');
  });

  it('searches Firestore users and selects every visible result', () => {
    component.notificationUserSearch = 'delegate';

    expect(component.filteredNotificationUsers.length).toBe(2);
    component.selectVisibleUsers('update');

    expect(component.selectedUserIds).toEqual(['delegate-a', 'delegate-b']);
    expect(component.selectedRecipientCount).toBe(2);
    expect(component.pushReadyRecipientCount).toBe(2);
  });

  it('shows the same Firestore-backed audience choices for updates and activities', () => {
    component.selectedSection = 'updates';
    component.audienceKind = 'users';
    fixture.detectChanges();
    const updatesText = fixture.nativeElement.textContent as string;

    expect(updatesText).toContain('Select users');
    expect(updatesText).toContain('Participants group');
    expect(updatesText).toContain('Plant visitors');
    expect(updatesText).not.toContain('One attendee');
    expect(updatesText).toContain('Choose attendees');
    expect(updatesText).toContain('a@example.com');
    expect(fixture.nativeElement.querySelectorAll('.audience-mode').length).toBe(1);

    component.selectedSection = 'engagement';
    component.activityAudienceKind = 'users';
    fixture.detectChanges();
    const activitiesText = fixture.nativeElement.textContent as string;

    expect(activitiesText).toContain('Select users');
    expect(activitiesText).toContain('Participants group');
    expect(activitiesText).toContain('Plant visitors');
    expect(activitiesText).not.toContain('One attendee');
    expect(activitiesText).toContain('Choose attendees');
    expect(activitiesText).toContain('b@example.com');
    expect(fixture.nativeElement.querySelectorAll('.audience-mode').length).toBe(1);

    component.activityAudienceKind = 'group';
    fixture.detectChanges();
    const groupText = fixture.nativeElement.textContent as string;
    expect(groupText).toContain('Choose a participants group');
    expect(groupText).toContain('Participants group: Leadership');
    expect(groupText).toContain('Participants group: Operations');
  });

  it('sends to the selected Firestore participant group after confirmation', async () => {
    component.audienceKind = 'group';
    component.selectedSegmentKey = 'participantsGroup:Leadership';
    component.notificationTitle = 'Schedule update';
    component.notificationBody = 'The session location changed.';

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Schedule update',
      'The session location changed.',
      { kind: 'segment', field: 'participantsGroup', value: 'Leadership' }
    );
  });

  it('targets the exact participantsGroup value', async () => {
    component.audienceKind = 'group';
    component.selectedSegmentKey = 'participantsGroup:Leadership';
    component.notificationTitle = 'Leadership briefing';
    component.notificationBody = 'Please review the updated agenda.';

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Leadership briefing',
      'Please review the updated agenda.',
      { kind: 'segment', field: 'participantsGroup', value: 'Leadership' }
    );
  });

  it('targets only attendees marked as plant visitors', async () => {
    component.audienceKind = 'plantVisitors';
    component.notificationTitle = 'Plant visit update';
    component.notificationBody = 'Please review the site visit details.';

    await component.sendNotification();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      'Plant visit update',
      'Please review the site visit details.',
      { kind: 'segment', field: 'plantVisit', value: 'true' }
    );
  });

  it('schedules an audience push using Egypt time', async () => {
    component.updateMode = 'scheduled';
    component.scheduledDateTime = '2026-12-01T12:30';
    component.notificationTitle = 'Agenda change';
    component.notificationBody = 'The session location changed.';

    await component.sendNotification();

    expect(adminService.scheduleNotification).toHaveBeenCalledWith(
      'Agenda change',
      'The session location changed.',
      { kind: 'all' },
      '2026-12-01T10:30:00.000Z'
    );
    expect(component.noticeMessage).toContain('scheduled');
    expect(component.noticeMessage).toContain('Egypt time');
  });

  it('publishes a quiz to the selected audience segment', async () => {
    component.activityTitle = 'Safety check';
    component.activityQuestion = 'Which item protects your eyes?';
    component.activityOptions = ['Safety glasses', 'Open sandals'];
    component.correctOptionIndex = 0;
    component.activityAudienceKind = 'group';
    component.activitySelectedSegmentKey = 'participantsGroup:Leadership';

    await component.createInteractiveActivity();

    expect(adminService.createInteractiveActivity).toHaveBeenCalledWith({
      title: 'Safety check',
      question: 'Which item protects your eyes?',
      options: ['Safety glasses', 'Open sandals'],
      kind: 'quiz',
      target: { kind: 'segment', field: 'participantsGroup', value: 'Leadership' },
      correctOptionIndex: 0,
    });
  });

  it('uses the same multi-user audience for a poll', async () => {
    component.activityKind = 'poll';
    component.activityTitle = 'Quick check';
    component.activityQuestion = 'Are you ready?';
    component.activityOptions = ['Yes', 'No'];
    component.activityAudienceKind = 'users';
    component.activitySelectedUserIds = ['delegate-a', 'delegate-b'];

    await component.createInteractiveActivity();

    expect(adminService.createInteractiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'poll',
        target: { kind: 'users', userIds: ['delegate-a', 'delegate-b'] },
      })
    );
  });

  it('uses the same plant visitor audience for a quiz', async () => {
    component.activityTitle = 'Site visit check';
    component.activityQuestion = 'Are you attending the plant visit?';
    component.activityOptions = ['Yes', 'No'];
    component.activityAudienceKind = 'plantVisitors';

    await component.createInteractiveActivity();

    expect(adminService.createInteractiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'segment', field: 'plantVisit', value: 'true' },
      })
    );
  });

  it('keeps the update composer available and explains unavailable audience data', () => {
    component.dashboard = null;
    component.selectedSection = 'updates';
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Publish an update');
    expect(pageText).toContain('All users');
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
    expect(page.textContent).toContain('Push accepted means Firebase accepted the send request');
    expect(page.textContent).toContain('In-app counts are recipients with a saved inbox entry');
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

  it('uses dashboard attendee statuses rather than notification-audience placeholders', () => {
    component.dashboard = {
      ...dashboard,
      attendees: [
        {
          ...dashboard.attendees[0],
          loggedIn: true,
          installed: true,
          hasPushToken: true,
          safetyInductionCompleted: true,
          safetyInductionStatus: 'Done',
        },
      ],
    };
    component.notificationAudience = [
      {
        ...dashboard.attendees[0],
        loggedIn: false,
        installed: false,
        hasPushToken: false,
        safetyInductionCompleted: false,
        safetyInductionStatus: 'Not started',
      },
    ];
    component.attendeeSearch = 'a@example.com';
    component.attendeeStatusFilter = 'installed';

    expect(component.filteredAttendees).toEqual([
      {
        ...dashboard.attendees[0],
        loggedIn: true,
        installed: true,
        hasPushToken: true,
        safetyInductionCompleted: true,
        safetyInductionStatus: 'Done',
      },
    ]);
  });

  it('exports the currently filtered attendees as CSV', () => {
    component.selectedSection = 'attendees';
    component.attendeeSearch = 'delegate-a';
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
    } as unknown as HTMLAnchorElement);

    component.exportAttendees();

    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });

  it('shows activity lifecycle status without offering unsupported close persistence', async () => {
    adminService.listAdminInteractiveActivities.mockResolvedValue({
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
          responses: [
            {
              email: 'poll-user@example.com',
              optionIndex: 0,
              option: 'Yes',
              isCorrect: null,
            },
          ],
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
          responses: [
            {
              email: 'quiz-user@example.com',
              optionIndex: 0,
              option: 'A',
              isCorrect: true,
            },
            {
              email: 'another-user@example.com',
              optionIndex: 1,
              option: 'B',
              isCorrect: false,
            },
          ],
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

  it('shows respondent, selected answer, and quiz correctness in activity results', async () => {
    adminService.listAdminInteractiveActivities.mockResolvedValue({
      activities: [
        {
          id: 'quiz-results',
          title: 'Knowledge check',
          question: 'Which answer is correct?',
          options: ['Correct option', 'Other option'],
          kind: 'quiz',
          active: true,
          target: { kind: 'all' },
          responseCount: 2,
          optionCounts: [1, 1],
          correctCount: 1,
          responses: [
            {
              email: 'right@example.com',
              optionIndex: 0,
              option: 'Correct option',
              isCorrect: true,
            },
            {
              email: 'wrong@example.com',
              optionIndex: 1,
              option: 'Other option',
              isCorrect: false,
            },
          ],
        },
      ],
    });

    await component.loadAdminActivities();
    component.selectedSection = 'engagement';
    component.toggleActivityResults('quiz-results');
    fixture.detectChanges();

    const tableText = fixture.nativeElement.querySelector('.activity-responses-table')
      ?.textContent as string;
    expect(tableText).toContain('right@example.com');
    expect(tableText).toContain('Correct option');
    expect(tableText).toContain('Correct');
    expect(tableText).toContain('wrong@example.com');
    expect(tableText).toContain('Other option');
    expect(tableText).toContain('Incorrect');
  });

  it('renders legacy activity results without a response list', async () => {
    adminService.listAdminInteractiveActivities.mockResolvedValue({
      activities: [
        {
          id: 'legacy-activity',
          title: 'Legacy poll',
          question: 'Legacy question?',
          options: ['A', 'B'],
          kind: 'poll',
          active: true,
          target: { kind: 'all' },
          responseCount: 1,
          optionCounts: [1, 0],
          correctCount: null,
        },
      ],
    });

    await component.loadAdminActivities();
    component.selectedSection = 'engagement';
    component.toggleActivityResults('legacy-activity');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      '1 response(s) recorded, but respondent details were not returned.'
    );
    expect(fixture.nativeElement.textContent).toContain(
      'update the Cloud Functions deployment.'
    );
    expect(fixture.nativeElement.textContent).not.toContain('No responses yet.');
  });

  it('shows no responses when counts and respondent details are empty', async () => {
    adminService.listAdminInteractiveActivities.mockResolvedValue({
      activities: [
        {
          id: 'empty-activity',
          title: 'Empty poll',
          question: 'No one responded?',
          options: ['A', 'B'],
          kind: 'poll',
          active: true,
          target: { kind: 'all' },
          responseCount: 0,
          optionCounts: [0, 0],
          correctCount: null,
          responses: [],
        },
      ],
    });

    await component.loadAdminActivities();
    component.selectedSection = 'engagement';
    component.toggleActivityResults('empty-activity');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No responses yet.');
    expect(fixture.nativeElement.textContent).not.toContain(
      'respondent details were not returned'
    );
  });
});
