// Caps large counters at "99+" for compact badge display (notification
// bells, tab pills, etc.) so triple/quadruple-digit counts never overflow
// a small badge.
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "20 Jul 26, 02:30 PM" - used for notification/audit-log timestamps so log
// entries stay readable without relying on toLocaleString(), whose output
// format/locale can vary across the RN engines this app runs on.
export function formatDateTime12h(dateInput: string | number | Date): string {
  const d = new Date(dateInput);
  const day = d.getDate();
  const month = MONTH_ABBR[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm} ${ampm}`;
}
