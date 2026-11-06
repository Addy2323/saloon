export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return 'TSh ' + Math.round(value).toLocaleString('en-US');
}

export function formatNumber(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US');
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfMonthISO(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
}

export function startOfYearISO(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}
