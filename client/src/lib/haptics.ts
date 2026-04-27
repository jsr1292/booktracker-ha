/**
 * Lightweight haptic feedback for Android.
 * iOS silently ignores — no-op there.
 */
export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently ignore
  }
}

export const haptics = {
  statusChange: () => haptic(10),
  bookDeleted: () => haptic([10, 30, 10]),
  achievementUnlocked: () => haptic([20, 50, 20, 50, 20]),
  pullRefresh: () => haptic(5),
  swipeTrigger: () => haptic(10),
};
