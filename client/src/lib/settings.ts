import { fetchReadingGoal, isLoggedIn, updateReadingGoal } from './auth';

const KEY = 'booktracker_reading_goal';
const cachedGoal = () => {
  const value = Number(localStorage.getItem(KEY));
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 12;
};

export async function getReadingGoal(): Promise<number> {
  if (isLoggedIn()) {
    try {
      const { reading_goal } = await fetchReadingGoal();
      localStorage.setItem(KEY, String(reading_goal));
      return reading_goal;
    } catch { return cachedGoal(); }
  }
  return cachedGoal();
}

export async function setReadingGoal(goal: number): Promise<number> {
  if (!Number.isInteger(goal) || goal < 1 || goal > 1000) throw new Error('Goal must be an integer from 1 to 1000');
  const saved = isLoggedIn() ? (await updateReadingGoal(goal)).reading_goal : goal;
  localStorage.setItem(KEY, String(saved));
  return saved;
}
