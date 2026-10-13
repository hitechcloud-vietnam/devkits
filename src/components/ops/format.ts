// Display helpers for the operator portal (vi-VN, Asia/Ho_Chi_Minh by browser locale).

const pad = (n: number) => String(n).padStart(2, "0");

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** dd/MM in the current year, dd/MM/yyyy otherwise (T16b). */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const base = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}/${d.getFullYear()}`;
}

/** Today → hh:mm, yesterday → "Hôm qua", else dd/MM. */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Hôm qua";
  return shortDate(iso, now);
}

/** "Dùng 2 phút trước" style phrase for last-use timestamps. */
export function timeAgo(iso: string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24 && sameDay(new Date(iso), now)) return `${h} giờ trước`;
  return relativeDay(iso, now) === "Hôm qua" ? "hôm qua" : shortDate(iso, now);
}

/** Days until a timestamp (negative when past). */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}

/** Signed change vs the previous period, e.g. "+3 so với 7 ngày trước". */
export function delta(current: number, previous: number, format: (n: number) => string = formatNumber): string {
  const d = current - previous;
  if (d === 0) return "Bằng 7 ngày trước";
  return `${d > 0 ? "+" : "−"}${format(Math.abs(d))} so với 7 ngày trước`;
}
