export function formatRefundTime(date = new Date()) {
  const part = (value) => String(value).padStart(2, '0');
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}`;
}
export function parseRefundTime(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) throw new Error('Enter the returned date and time as DD/MM/YYYY HH:MM.');
  const [, day, month, year, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
      || date.getHours() !== hour || date.getMinutes() !== minute) throw new Error('Enter a valid returned date and time.');
  return date.toISOString();
}
