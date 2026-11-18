const INDIA_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export function indiaBusinessDate(value: number | string | Date): string | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time + INDIA_OFFSET_MS).toISOString().slice(0, 10) : null;
}

export function indiaBusinessDayRange(date: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime()) || indiaBusinessDate(start) !== date) return null;
  return { start, end: new Date(start.getTime() + DAY_MS - 1) };
}

export function startOfIndiaBusinessDay(now = Date.now()): Date {
  return indiaBusinessDayRange(indiaBusinessDate(now)!)!.start;
}
