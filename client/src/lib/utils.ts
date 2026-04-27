/**
 * Utility functions for the Book Tracker PWA
 */

// ── Reading time estimate ─────────────────────────────────────────────
/**
 * Estimate reading time based on page count.
 * Assumes 250 words per page, 250 words per minute reading speed.
 * So: 250 wpm / 250 wpp = 1 page per minute
 */
export function estimateReadingTime(pages: number | null | undefined): string {
  if (!pages || pages <= 0) return '';
  const minutes = pages; // 1 page per minute
  if (minutes < 60) return `≈ ${minutes}m read`;
  const hours = Math.round(minutes / 60);
  return `≈ ${hours}h read`;
}

// ── Relative date formatting ───────────────────────────────────────────
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - targetDay.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays >= 7 && diffDays < 14) return '1 week ago';
  if (diffDays >= 14 && diffDays < 21) return '2 weeks ago';
  if (diffDays >= 21 && diffDays < 30) return '3 weeks ago';
  if (diffDays >= 30 && diffDays < 60) return '1 month ago';
  if (diffDays >= 60 && diffDays < 90) return '2 months ago';
  if (diffDays >= 90 && diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  if (diffDays >= 365 && diffDays < 730) return '1 year ago';
  if (diffDays >= 730) return `${Math.floor(diffDays / 365)} years ago`;

  // Future dates
  if (diffDays < -1 && diffDays > -7) return `in ${Math.abs(diffDays)} days`;
  if (diffDays <= -7 && diffDays > -14) return 'in 1 week';
  if (diffDays <= -14 && diffDays < -30) return 'in 2 weeks';
  if (diffDays <= -30 && diffDays > -60) return 'in 1 month';

  // Fallback to formatted date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Status badge helpers ───────────────────────────────────────────────
export interface StatusBadge {
  cls: string;
  text: string;
  emoji: string;
  iconCls: string;
}

export function getStatusBadge(status: string): StatusBadge {
  switch (status) {
    case 'reading':
      return { cls: 'badge-green', text: 'Reading', emoji: '📖', iconCls: 'badge-icon-reading' };
    case 'finished':
      return { cls: 'badge-gold', text: 'Finished', emoji: '✅', iconCls: 'badge-icon-finished' };
    case 'abandoned':
      return { cls: 'badge-red', text: 'Abandoned', emoji: '❌', iconCls: 'badge-icon-abandoned' };
    case 'planned':
      return { cls: 'badge-blue', text: 'Planned', emoji: '📋', iconCls: 'badge-icon-planned' };
    default:
      return { cls: 'badge-gold', text: 'Finished', emoji: '✅', iconCls: 'badge-icon-finished' };
  }
}

// ── Greeting based on time of day ─────────────────────────────────────
export function getGreeting(name?: string | null): string {
  const hour = new Date().getHours();
  let timeGreeting: string;
  if (hour >= 5 && hour < 12) {
    timeGreeting = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeGreeting = 'Good evening';
  } else {
    timeGreeting = 'Good night';
  }

  if (name) {
    return `${timeGreeting}, ${name}`;
  }
  return timeGreeting;
}

// ── Sparkline data ────────────────────────────────────────────────────
export interface SparklineBar {
  month: string;
  count: number;
  height: number; // percentage 0-100
}

export function computeSparkline(booksPerMonth: { month: string; count: number }[], maxBars = 6): SparklineBar[] {
  if (!booksPerMonth || booksPerMonth.length === 0) return [];

  const recent = booksPerMonth.slice(-maxBars);
  const maxCount = Math.max(...recent.map(b => b.count), 1);

  return recent.map(b => ({
    ...b,
    height: Math.max((b.count / maxCount) * 100, b.count > 0 ? 15 : 0),
  }));
}

// ── Format number ──────────────────────────────────────────────────────
export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// ── Format duration ────────────────────────────────────────────────────
export function formatDuration(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

// ── Haptic feedback helpers ───────────────────────────────────────────
export function hapticLight() {
  try { navigator?.vibrate?.(10); } catch {}
}

export function hapticMedium() {
  try { navigator?.vibrate?.([20, 30, 20]); } catch {}
}

export function hapticHeavy() {
  try { navigator?.vibrate?.([30, 50, 30, 50, 30]); } catch {}
}

// Different patterns for delete vs finish swipe
export function hapticDelete() {
  try { navigator?.vibrate?.([50, 30, 100, 30, 50]); } catch {}
}

export function hapticFinish() {
  try { navigator?.vibrate?.([20, 20, 20, 20, 40]); } catch {}
}

export function hapticLongPress() {
  try { navigator?.vibrate?.([10, 20, 10]); } catch {}
}
