/**
 * Business Hours helper for WhatsApp shared inbox.
 * Determines if the current time falls within configured business hours
 * and provides the next opening time for away messages.
 */

export interface DaySchedule {
  start: string; // HH:mm format (e.g. "09:00")
  end: string;   // HH:mm format (e.g. "18:00")
  closed?: boolean;
}

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone: string;
  schedule: Record<string, DaySchedule>;
  away_message: string;
}

/** Day name map from JS getDay() index to our schedule keys */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Parse a HH:mm time string into minutes since midnight.
 */
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Get the current date/time in the configured timezone.
 */
function getNowInTimezone(timezone: string): { dayIndex: number; minutesSinceMidnight: number; date: Date } {
  const now = new Date();
  // Format the date in the target timezone to extract components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  // Get the day of week in the timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayIndex = DAY_NAMES.indexOf(dayName);

  return {
    dayIndex: dayIndex >= 0 ? dayIndex : now.getDay(),
    minutesSinceMidnight: hour * 60 + minute,
    date: now,
  };
}

/**
 * Check if the current time is within business hours.
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  if (!config.enabled) return true; // If disabled, always "within hours"

  const { dayIndex, minutesSinceMidnight } = getNowInTimezone(config.timezone);
  const dayName = DAY_NAMES[dayIndex];
  const daySchedule = config.schedule[dayName];

  // If no schedule for this day, or marked as closed
  if (!daySchedule || daySchedule.closed) return false;

  const startMinutes = parseTime(daySchedule.start);
  const endMinutes = parseTime(daySchedule.end);

  return minutesSinceMidnight >= startMinutes && minutesSinceMidnight < endMinutes;
}

/**
 * Find the next opening time from now.
 * Checks up to 7 days ahead.
 */
export function getNextOpenTime(config: BusinessHoursConfig): Date | null {
  if (!config.enabled) return null;

  const { dayIndex, date } = getNowInTimezone(config.timezone);

  // Check next 7 days starting from today
  for (let offset = 0; offset < 7; offset++) {
    const checkDayIndex = (dayIndex + offset) % 7;
    const dayName = DAY_NAMES[checkDayIndex];
    const daySchedule = config.schedule[dayName];

    if (!daySchedule || daySchedule.closed) continue;

    const [startH, startM] = daySchedule.start.split(':').map(Number);
    const nextOpen = new Date(date);
    nextOpen.setDate(nextOpen.getDate() + offset);
    nextOpen.setHours(startH || 0, startM || 0, 0, 0);

    // If it's today and the opening time is in the past, skip
    if (offset === 0 && nextOpen <= date) continue;

    return nextOpen;
  }

  return null;
}

/**
 * Default business hours config for new setups.
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: false,
  timezone: 'Asia/Dubai',
  schedule: {
    sunday: { start: '09:00', end: '18:00' },
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00', closed: true },
    saturday: { start: '09:00', end: '18:00', closed: true },
  },
  away_message: 'شكراً لتواصلك! نحن خارج ساعات العمل حالياً. سنرد عليك في أقرب وقت خلال ساعات العمل. 🕐',
};
