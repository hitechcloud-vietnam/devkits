// Vietnamese relative times and dates for token and activity rows (T16b: drop the year
// when it is the current year).

export function relativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;
  return shortDate(iso);
}

export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() === now.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${d.getFullYear()}`;
}

/** Expiry label and whether it needs attention (≤ 7 days). */
export function expiryLabel(iso: string | null, now = Date.now()): { text: string; soon: boolean; expired: boolean } {
  if (!iso) return { text: "Không hết hạn", soon: false, expired: false };
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: "Đã hết hạn", soon: false, expired: true };
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 7) return { text: `Hết hạn sau ${days} ngày`, soon: true, expired: false };
  return { text: `Hết hạn ${shortDate(iso)}`, soon: false, expired: false };
}
