export interface Book {
  id?: number; // auto-increment — undefined before insert
  title: string;
  author?: string | null;
  date_finished?: string | null; // NOTE: undefined means not yet set, null means explicitly cleared
  pages?: number | null;
  rating?: number | null;
  genre?: string | null;
  language?: string | null;
  status: 'reading' | 'finished' | 'abandoned' | 'planned';
  date_started?: string | null;
  cover_url?: string | null;
  description?: string | null;
  notes?: string | null;
  created_at: string;
  planned_date?: string | null;
  updated_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlocked_at: string | null;
  progress: number;
  target: number;
  unit: string;
}

export interface Stats {
  total_books: number;
  total_finished: number;
  currently_reading: number;
  total_pages: number;
  mind_sharpness: number;
  achievements: Achievement[];
  books_per_month: { month: string; count: number }[];
  genre_distribution: { genre: string; count: number }[];
  avg_rating_over_time: { month: string; avg_rating: number }[];
  global_avg_rating: number | null; // can be null or 0 when no ratings exist
  reading_streak: number;
  current_streak: number;
  avg_pages: number;
  avg_days_to_finish: number | null;
  reading_goal?: number;
  reading_goal_progress?: number;
  // finished field removed — use db.books.where('status').equals('finished') directly if needed
}
