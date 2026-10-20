const EGYPT_TIME_ZONE = 'Africa/Cairo';

function partsInEgypt(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: EGYPT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

export function formatEgyptDateTime(date: Date): string {
  const parts = partsInEgypt(date);
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

export function egyptDateTimeToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Enter a valid Egypt date and time.');
  }

  const [, year, month, day, hour, minute] = match;
  const targetWallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  let utcTime = targetWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = partsInEgypt(new Date(utcTime));
    const representedWallTime = Date.UTC(
      Number(parts['year']),
      Number(parts['month']) - 1,
      Number(parts['day']),
      Number(parts['hour']),
      Number(parts['minute']),
      Number(parts['second'])
    );
    const correction = targetWallTime - representedWallTime;
    utcTime += correction;
    if (correction === 0) {
      break;
    }
  }

  const result = new Date(utcTime);
  if (formatEgyptDateTime(result) !== value) {
    throw new Error('That Egypt local time does not exist. Choose another time.');
  }
  return result.toISOString();
}
