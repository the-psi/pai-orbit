'use strict';
// Working-time arithmetic for reminders, escalation and maximum parked age (REQ-15, REQ-42).
// No public-holiday support: a documented limit of the first build.

const STEP_MS = 5 * 60 * 1000;

function partsIn(timeZone, date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: days[out.weekday], hour: Number(out.hour), minute: Number(out.minute) };
}

/** True when `date` falls inside the working calendar. */
function isWorking(calendar, date) {
  const { day, hour } = partsIn(calendar.timeZone || 'UTC', date);
  return calendar.days.includes(day) && hour >= calendar.startHour && hour < calendar.endHour;
}

/**
 * Working milliseconds between two instants, to a 5-minute resolution.
 * @param {{timeZone: string, days: number[], startHour: number, endHour: number}} calendar
 * @param {Date|string|number} from
 * @param {Date|string|number} to
 */
function workingMsBetween(calendar, from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!(end > start)) return 0;
  let total = 0;
  for (let t = start; t < end; t += STEP_MS) {
    if (isWorking(calendar, new Date(t))) total += Math.min(STEP_MS, end - t);
  }
  return total;
}

/** Hours in one working day of this calendar. */
function workingDayHours(calendar) {
  return calendar.endHour - calendar.startHour;
}

module.exports = { isWorking, workingMsBetween, workingDayHours };
