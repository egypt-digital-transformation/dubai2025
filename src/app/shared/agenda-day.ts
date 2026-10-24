export interface MappedAgendaSession {
  id: string;
  title: string;
  startTime: Date | null;
  endTime: Date | null;
  location: string;
  day: string;
  description: string;
  category: string;
  color: string;
  isGeneral: boolean;
  material?: string;
  qnaLink?: string;
  labelGroupId?: string;
  speaker?: {
    name: string;
    title: string;
    photoURL: string | null;
    userID: string;
  };
}

type RecordValue = Record<string, unknown>;

const AGENDA_PALETTE: Record<string, string> = {
  '#1d4370': 'var(--holcim-dark-blue)',
  '#94c12e': 'var(--holcim-bright-green)',
  '#04bbf1': 'var(--holcim-bright-blue)',
  '#ffd100': 'var(--holcim-yellow)',
  '#e4002b': 'var(--holcim-bright-red)',
  '#e6007e': 'var(--holcim-fuchsia)',
  '#ff671f': 'var(--holcim-orange)',
  '#9a0039': 'var(--holcim-dark-red)',
  '#662483': 'var(--holcim-violet)',
  '#009a44': 'var(--holcim-green)',
  '#006d68': 'var(--holcim-dark-turquoise)',
  '#00a499': 'var(--holcim-bright-turquoise)',
};

function getAgendaColor(value: unknown): string {
  const color = asText(value).toLowerCase();
  return AGENDA_PALETTE[color] ?? 'var(--holcim-dark-turquoise)';
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timestampDate(value: unknown): Date | null {
  const timestamp = asRecord(value);
  const toDate = timestamp?.['toDate'];
  if (typeof toDate !== 'function') return null;
  const date = toDate.call(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

export function parseAgendaDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const day = Number(match[2]);
  const month = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export interface AgendaDayDate {
  dayNumber: number;
  date: Date;
}

export function selectAgendaDayForDate(
  agendaDays: AgendaDayDate[],
  currentDate: Date
): number | null {
  if (!agendaDays.length || Number.isNaN(currentDate.getTime())) return null;

  const sortedDays = [...agendaDays].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const today = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  );
  let selectedDay = sortedDays[0].dayNumber;
  for (const agendaDay of sortedDays) {
    const agendaDate = new Date(
      agendaDay.date.getFullYear(),
      agendaDay.date.getMonth(),
      agendaDay.date.getDate()
    );
    if (today < agendaDate) break;
    selectedDay = agendaDay.dayNumber;
  }
  return selectedDay;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const timestampValue = timestampDate(value);
  if (timestampValue) return timestampValue;

  if (typeof value !== 'string') return null;
  const agendaDate = parseAgendaDate(value);
  if (agendaDate) return agendaDate;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function combineDateAndTime(dayDate: Date | null, value: unknown): Date | null {
  let timeDate: Date | null = null;

  if (value instanceof Date) {
    timeDate = value;
  } else {
    timeDate = timestampDate(value);
  }

  if (!timeDate && typeof value === 'string') {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (match) {
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3] || 0);
      const meridiem = match[4]?.toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      if (
        hours > 23 ||
        minutes > 59 ||
        seconds > 59 ||
        (meridiem && Number(match[1]) > 12)
      ) {
        return null;
      }

      timeDate = dayDate
        ? new Date(
            dayDate.getFullYear(),
            dayDate.getMonth(),
            dayDate.getDate(),
            hours,
            minutes,
            seconds
          )
        : null;
    } else {
      timeDate = parseDate(value);
    }
  }

  if (!timeDate || Number.isNaN(timeDate.getTime())) return null;
  if (!dayDate) return timeDate;
  return new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    timeDate.getHours(),
    timeDate.getMinutes(),
    timeDate.getSeconds(),
    timeDate.getMilliseconds()
  );
}

function mapSpeaker(value: unknown): MappedAgendaSession['speaker'] {
  if (typeof value === 'string') {
    return value.trim()
      ? { name: value.trim(), title: '', photoURL: null, userID: '' }
      : undefined;
  }

  const speaker = asRecord(value);
  if (!speaker) return undefined;
  const name = asText(speaker['name']);
  if (!name) return undefined;
  return {
    name,
    title: asText(speaker['title']),
    photoURL: asText(speaker['photoURL']) || null,
    userID: asText(speaker['userID']),
  };
}

function findLabelGroupId(
  category: string,
  startTime: Date | null,
  dayDate: Date | null,
  labels: unknown[]
): string {
  const matchingLabels = labels
    .map((value, index) => ({ label: asRecord(value), index }))
    .filter(({ label }) => asText(label?.['label']) === category);

  if (!matchingLabels.length) return `category:${category}`;

  const labelTimes = matchingLabels.map(({ label, index }) => ({
    index,
    start: combineDateAndTime(dayDate, label?.['startTime']),
    end: combineDateAndTime(dayDate, label?.['endTime']),
  }));

  if (startTime) {
    const matchingInterval = labelTimes.find(({ start, end }) =>
      start && end && startTime >= start && startTime < end
    );
    if (matchingInterval) return `label:${matchingInterval.index}`;

    const precedingLabel = labelTimes
      .filter(({ start }) => start && start <= startTime)
      .sort((a, b) => b.start!.getTime() - a.start!.getTime())[0];
    if (precedingLabel) return `label:${precedingLabel.index}`;
  }

  return `label:${matchingLabels[0].index}`;
}

export function mapAgendaDaySessions(dayDocument: RecordValue): MappedAgendaSession[] {
  const dayNumber = Number(dayDocument['dayNumber']);
  const day = Number.isInteger(dayNumber) && dayNumber > 0 ? String(dayNumber) : '';
  const dayDate = parseDate(dayDocument['date']);
  const sessions = dayDocument['sessions'];
  const labels = Array.isArray(dayDocument['labels']) ? dayDocument['labels'] : [];
  if (!day || !Array.isArray(sessions)) return [];

  return sessions.flatMap((value, index) => {
    const session = asRecord(value);
    if (!session) return [];

    const startTime = combineDateAndTime(
      dayDate,
      session['startTime'] ?? session['timeFrom']
    );
    let endTime = combineDateAndTime(
      dayDate,
      session['endTime'] ?? session['timeTo']
    );
    if (startTime && endTime && endTime < startTime) {
      endTime = new Date(
        endTime.getFullYear(),
        endTime.getMonth(),
        endTime.getDate() + 1,
        endTime.getHours(),
        endTime.getMinutes(),
        endTime.getSeconds(),
        endTime.getMilliseconds()
      );
    }

    const content = asText(session['content']);
    const title =
      content ||
      asText(session['title']) ||
      asText(session['label']) ||
      asText(session['description']) ||
      'Session';
    const category =
      asText(session['label']) ||
      asText(session['track']) ||
      asText(session['category']) ||
      'general';
    const storedId = asText(session['sessionId']) || asText(session['id']);

    return [{
      id: storedId || `${day}-${index}`,
      title,
      startTime,
      endTime,
      location: asText(session['location']),
      day,
      description: content || asText(session['description']),
      category,
      color: getAgendaColor(session['color']),
      isGeneral: true,
      material: asText(session['material']) || asText(session['attachment']),
      qnaLink: asText(session['qnaLink']),
      labelGroupId: findLabelGroupId(
        category,
        startTime,
        dayDate,
        labels
      ),
      speaker: mapSpeaker(session['speaker']),
    }];
  });
}
