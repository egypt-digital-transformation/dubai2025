import {
  mapAgendaDaySessions,
  parseAgendaDate,
  selectAgendaDayForDate,
} from '../../src/app/shared/agenda-day';

describe('selectAgendaDayForDate', () => {
  const agendaDays = [
    { dayNumber: 1, date: new Date(2026, 10, 9) },
    { dayNumber: 2, date: new Date(2026, 10, 10) },
    { dayNumber: 3, date: new Date(2026, 10, 12) },
  ];

  it('selects the agenda day matching today', () => {
    expect(selectAgendaDayForDate(agendaDays, new Date(2026, 10, 10, 12))).toBe(2);
  });

  it('keeps the most recent agenda day across dates with no scheduled sessions', () => {
    expect(selectAgendaDayForDate(agendaDays, new Date(2026, 10, 11))).toBe(2);
  });

  it('selects the first agenda day before the event begins', () => {
    expect(selectAgendaDayForDate(agendaDays, new Date(2026, 10, 8))).toBe(1);
  });
});

describe('mapAgendaDaySessions', () => {
  it('parses agenda dates as year-day-month', () => {
    expect(parseAgendaDate('2026-09-11')).toEqual(new Date(2026, 10, 9));
    expect(parseAgendaDate('2026-10-11')).toEqual(new Date(2026, 10, 10));
    expect(parseAgendaDate('2026-31-11')).toBeNull();
  });

  it('maps the day document session fields and keeps its section label', () => {
    const [session] = mapAgendaDaySessions({
      date: '2026-10-11',
      dayNumber: 2,
      sessions: [{
        content: 'Health & Safety Briefing',
        endTime: '09:05',
        label: 'Welcome & Strategic Alignment',
        location: '',
        speaker: 'Hotel Representative',
        startTime: '09:00',
      }],
    });

    expect(session).toMatchObject({
      id: '2-0',
      title: 'Health & Safety Briefing',
      location: '',
      day: '2',
      description: 'Health & Safety Briefing',
      category: 'Welcome & Strategic Alignment',
      isGeneral: true,
      speaker: { name: 'Hotel Representative' },
    });
    expect(session.startTime).toEqual(new Date(2026, 10, 10, 9, 0));
    expect(session.endTime).toEqual(new Date(2026, 10, 10, 9, 5));
  });

  it('limits agenda accents to colors from the Holcim palette', () => {
    const sessions = mapAgendaDaySessions({
      date: '2026-10-11',
      dayNumber: 2,
      sessions: [
        { content: 'Green session', color: '#94C12E' },
        { content: 'Custom color session', color: '#123456' },
      ],
    });

    expect(sessions.map((session) => session.color)).toEqual([
      'var(--holcim-bright-green)',
      'var(--holcim-premium-blue)',
    ]);
  });

  it('treats a midnight end time as the next day', () => {
    const [session] = mapAgendaDaySessions({
      date: '2026-10-11',
      dayNumber: 2,
      sessions: [{
        content: 'Evening Celebration & Dinner Cruise',
        endTime: '00:00',
        label: 'Gala Dinner',
        startTime: '19:00',
      }],
    });

    expect(session.startTime).toEqual(new Date(2026, 10, 10, 19, 0));
    expect(session.endTime).toEqual(new Date(2026, 10, 11, 0, 0));
  });

  it('continues to support the previous time and title field names', () => {
    const [session] = mapAgendaDaySessions({
      date: '2026-10-11',
      dayNumber: 2,
      sessions: [{
        title: 'Older session format',
        timeFrom: '10:00',
        timeTo: '10:30',
      }],
    });

    expect(session.title).toBe('Older session format');
    expect(session.startTime).toEqual(new Date(2026, 10, 10, 10, 0));
    expect(session.endTime).toEqual(new Date(2026, 10, 10, 10, 30));
  });

  it('maps sessions to the matching label time when a label repeats', () => {
    const sessions = mapAgendaDaySessions({
      date: '2026-10-11',
      dayNumber: 2,
      labels: [
        { label: 'WORKSHOPS', startTime: '13:00', endTime: '13:45' },
        { label: 'WORKSHOPS', startTime: '14:00', endTime: '14:45' },
      ],
      sessions: [
        {
          content: 'Workshop A',
          label: 'WORKSHOPS',
          startTime: '14:00',
          endTime: '14:15',
        },
        {
          content: 'Workshop B',
          label: 'WORKSHOPS',
          startTime: '14:00',
          endTime: '14:15',
        },
      ],
    });

    expect(sessions.map((session) => session.labelGroupId)).toEqual([
      'label:1',
      'label:1',
    ]);
  });
});
