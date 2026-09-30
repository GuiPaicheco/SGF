const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !datePattern.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return timestamp / 86_400_000;
}

export function validSubmissionPeriods(periods: unknown, type: string, dailyHours: unknown, availableHours: unknown): boolean {
  if (!Array.isArray(periods) || periods.length < 1 || periods.length > 2) return false;
  let previousReturn = -Infinity;
  let totalDays = 0;
  for (const period of periods) {
    if (!period || typeof period !== 'object') return false;
    const entry = period as Record<string, unknown>;
    const start = dayNumber(entry.start_date);
    const end = dayNumber(entry.end_date);
    const returned = dayNumber(entry.return_date);
    const days = Number(entry.days);
    if (start === null || end === null || returned === null ||
        !Number.isInteger(days) || days < 1 || days > 90 ||
        start < previousReturn || end < start || returned <= end || days > end - start + 1) return false;
    previousReturn = returned;
    totalDays += days;
  }
  if (totalDays > 90) return false;
  if (type === 'banco_horas') {
    const daily = Number(dailyHours);
    const available = Number(availableHours);
    if (!Number.isFinite(daily) || daily <= 0 || daily > 24 ||
        !Number.isFinite(available) || available < totalDays * daily) return false;
  }
  return true;
}

export function requestedBankHours(periods: Array<{ days: number }>, dailyHours: number): number {
  return periods.reduce((total, period) => total + Number(period.days), 0) * dailyHours;
}
