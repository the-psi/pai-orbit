'use strict';
// Unit tests for src/calendar.js: working-time arithmetic.

const test = require('node:test');
const assert = require('node:assert/strict');
const { isWorking, workingMsBetween, workingDayHours } = require('../src/calendar');

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
// 2026-11-23 is a Monday.
const UTC = { timeZone: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 };
const IST = { ...UTC, timeZone: 'Asia/Kolkata' };

test('the fixture week starts on a Monday', () => {
  assert.equal(new Date('2026-11-23T00:00:00Z').getUTCDay(), 1);
});

test('workingMsBetween: inside one working day', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T10:00:00Z', '2026-11-23T12:30:00Z'), 2.5 * HOUR);
});

test('workingMsBetween: a whole working day counts only the working hours', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z'), 9 * HOUR);
  assert.equal(workingMsBetween(UTC, '2026-11-23T07:00:00Z', '2026-11-23T20:00:00Z'), 9 * HOUR);
});

test('workingMsBetween: across a night', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T17:00:00Z', '2026-11-24T10:00:00Z'), 2 * HOUR);
});

test('workingMsBetween: a range entirely outside working hours is zero', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T18:00:00Z', '2026-11-24T09:00:00Z'), 0);
  assert.equal(workingMsBetween(UTC, '2026-11-28T00:00:00Z', '2026-11-30T00:00:00Z'), 0, 'a whole weekend');
});

test('workingMsBetween: across a weekend (Fri 17:00 to Mon 10:00 UTC is 2 hours)', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-27T17:00:00Z', '2026-11-30T10:00:00Z'), 2 * HOUR);
});

test('workingMsBetween: a full week is five working days', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T00:00:00Z', '2026-11-30T00:00:00Z'), 45 * HOUR);
});

test('workingMsBetween: zero and negative ranges are zero', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T10:00:00Z', '2026-11-23T10:00:00Z'), 0);
  assert.equal(workingMsBetween(UTC, '2026-11-23T12:00:00Z', '2026-11-23T10:00:00Z'), 0);
  assert.equal(workingMsBetween(UTC, '2026-11-30T10:00:00Z', '2026-11-23T10:00:00Z'), 0);
});

test('workingMsBetween: an unparseable instant is zero, not NaN', () => {
  assert.equal(workingMsBetween(UTC, 'not a date', '2026-11-23T10:00:00Z'), 0);
  assert.equal(workingMsBetween(UTC, '2026-11-23T10:00:00Z', undefined), 0);
});

test('workingMsBetween: a range shorter than the 5-minute step is counted exactly', () => {
  assert.equal(workingMsBetween(UTC, '2026-11-23T10:00:00Z', '2026-11-23T10:07:00Z'), 7 * MIN);
  assert.equal(workingMsBetween(UTC, '2026-11-23T10:00:00Z', '2026-11-23T10:02:00Z'), 2 * MIN);
});

test('workingMsBetween: accepts Date objects and epoch milliseconds', () => {
  const from = new Date('2026-11-23T10:00:00Z');
  const to = new Date('2026-11-23T11:00:00Z');
  assert.equal(workingMsBetween(UTC, from, to), HOUR);
  assert.equal(workingMsBetween(UTC, from.getTime(), to.getTime()), HOUR);
});

test('workingMsBetween: a non-UTC zone works 09:00-18:00 local time (Asia/Kolkata, UTC+5:30)', () => {
  // 09:00 IST is 03:30 UTC; 18:00 IST is 12:30 UTC.
  assert.equal(workingMsBetween(IST, '2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z'), 9 * HOUR);
  assert.equal(workingMsBetween(IST, '2026-11-23T03:30:00Z', '2026-11-23T04:30:00Z'), HOUR);
  assert.equal(workingMsBetween(IST, '2026-11-23T02:30:00Z', '2026-11-23T04:30:00Z'), HOUR, 'the hour before 09:00 IST does not count');
  assert.equal(workingMsBetween(IST, '2026-11-23T12:00:00Z', '2026-11-23T14:00:00Z'), 30 * MIN, 'stops at 18:00 IST');
  // 13:00-17:00 UTC is working time in UTC and evening in Kolkata.
  assert.equal(workingMsBetween(UTC, '2026-11-23T13:00:00Z', '2026-11-23T17:00:00Z'), 4 * HOUR);
  assert.equal(workingMsBetween(IST, '2026-11-23T13:00:00Z', '2026-11-23T17:00:00Z'), 0);
});

test('workingMsBetween: a custom calendar (Sunday to Thursday, 08:00-12:00)', () => {
  const cal = { timeZone: 'UTC', days: [0, 1, 2, 3, 4], startHour: 8, endHour: 12 };
  // Sunday 2026-11-22.
  assert.equal(workingMsBetween(cal, '2026-11-22T00:00:00Z', '2026-11-23T00:00:00Z'), 4 * HOUR);
  // Friday 2026-11-27.
  assert.equal(workingMsBetween(cal, '2026-11-27T00:00:00Z', '2026-11-28T00:00:00Z'), 0);
});

test('isWorking: the start hour is inside, the end hour is outside', () => {
  assert.equal(isWorking(UTC, new Date('2026-11-23T08:59:00Z')), false);
  assert.equal(isWorking(UTC, new Date('2026-11-23T09:00:00Z')), true);
  assert.equal(isWorking(UTC, new Date('2026-11-23T17:59:00Z')), true);
  assert.equal(isWorking(UTC, new Date('2026-11-23T18:00:00Z')), false);
  assert.equal(isWorking(UTC, new Date('2026-11-23T00:30:00Z')), false, 'just after midnight');
});

test('isWorking: weekends are outside', () => {
  assert.equal(isWorking(UTC, new Date('2026-11-28T12:00:00Z')), false, 'Saturday');
  assert.equal(isWorking(UTC, new Date('2026-11-29T12:00:00Z')), false, 'Sunday');
  assert.equal(isWorking(UTC, new Date('2026-11-27T12:00:00Z')), true, 'Friday');
});

test('isWorking: the weekday and hour are taken in the calendar time zone', () => {
  assert.equal(isWorking(IST, new Date('2026-11-23T03:29:00Z')), false, '08:59 IST');
  assert.equal(isWorking(IST, new Date('2026-11-23T03:30:00Z')), true, '09:00 IST');
  assert.equal(isWorking(IST, new Date('2026-11-23T12:29:00Z')), true, '17:59 IST');
  assert.equal(isWorking(IST, new Date('2026-11-23T12:30:00Z')), false, '18:00 IST');
  // Sunday 21:00 UTC is Monday 10:00 in Auckland (UTC+13 in November).
  const nz = { ...UTC, timeZone: 'Pacific/Auckland' };
  assert.equal(isWorking(nz, new Date('2026-11-22T21:00:00Z')), true);
  assert.equal(isWorking(UTC, new Date('2026-11-22T21:00:00Z')), false);
  // Friday 21:00 UTC is Saturday 10:00 in Auckland.
  assert.equal(isWorking(nz, new Date('2026-11-27T21:00:00Z')), false);
});

test('isWorking: a calendar with no time zone is read as UTC', () => {
  const cal = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 };
  assert.equal(isWorking(cal, new Date('2026-11-23T09:00:00Z')), true);
  assert.equal(isWorking(cal, new Date('2026-11-23T08:00:00Z')), false);
});

test('workingDayHours is the length of one working day', () => {
  assert.equal(workingDayHours(UTC), 9);
  assert.equal(workingDayHours({ ...UTC, startHour: 8, endHour: 12 }), 4);
  assert.equal(workingDayHours({ ...UTC, startHour: 0, endHour: 24 }), 24);
});
