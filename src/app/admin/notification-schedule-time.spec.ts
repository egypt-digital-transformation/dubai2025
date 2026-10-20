import { egyptDateTimeToIso, formatEgyptDateTime } from './notification-schedule-time';

describe('Egypt notification schedule time', () => {
  it('converts Egypt wall time to the correct UTC instant', () => {
    expect(egyptDateTimeToIso('2026-12-01T12:30')).toBe('2026-12-01T10:30:00.000Z');
  });

  it('formats the minimum date in Egypt time rather than device-local time', () => {
    expect(formatEgyptDateTime(new Date('2026-12-01T10:30:00.000Z'))).toBe(
      '2026-12-01T12:30'
    );
  });

  it('rejects malformed local date-time values', () => {
    expect(() => egyptDateTimeToIso('not-a-date')).toThrowError(
      'Enter a valid Egypt date and time.'
    );
  });
});
