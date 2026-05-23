// Shared achievement definitions — canonical source of truth.
// Duplicated at:
//   api/src/shared/achievements.ts  (server)
//   client/src/lib/achievements.ts  (client — cannot import from server)
// Keep both copies in sync.

export interface AchievementStats {
  finished: number;
  totalPages: number;       // finished books with pages > 0
  currentStreak: number;    // distinct months with finished books
  rated: number;            // finished books with ratings
  genreCount: number;       // unique genres among finished books
  authorCount: number;      // unique authors among finished books
  longestBook: number;      // max pages among finished books (0 if none)
  shortestBook: number;     // min pages among finished books (0 if none)
  planned: number;          // books in 'planned' status
  total: number;            // all books
  fastestFinish: number;    // min days to finish (999 if none)
  slowestFinish: number;    // max days to finish (0 if none)
  maxPerMonth: number;      // max books finished in a single month
  completionRate: number;   // finished / (finished + abandoned), 0–1
  maxGenreCount: number;    // max books in any single genre
  highRatings: number;      // count of 4+ ratings among finished
  topRated: number;         // max rating (0 if none)
}

export interface AchievementResult {
  id: string;
  name: string;
  description: string;
  category: string;
  unlocked: boolean;
  unlocked_at: string | null;
  progress: number;
  target: number;
  unit: string;
}

type ComputeType =
  | 'ge'           // value >= target; progress = min(value, target)
  | 'ge01'         // value >= target; progress = 1 or 0
  | 'lt'           // value < target; progress = 1 or 0
  | 'range'        // shortestBook > 0 && < target; progress = 1 or 0
  | 'completionist'; // completionRate >= 0.9 && finished >= 5

interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: string;
  target: number;
  unit: string;
  field: keyof AchievementStats;
  type: ComputeType;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // 📚 Books Tiers
  { id: 'first_steps', name: 'First Steps', description: 'Finish your first book', category: '📚 Books', target: 1, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'bookworm', name: 'Bookworm', description: 'Finish 5 books', category: '📚 Books', target: 5, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'speed_reader', name: 'Speed Reader', description: 'Finish 10 books', category: '📚 Books', target: 10, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'quarter_century', name: 'Quarter Century', description: 'Finish 25 books', category: '📚 Books', target: 25, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'half_century', name: 'Half Century', description: 'Finish 50 books', category: '📚 Books', target: 50, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'century_club', name: 'Century Club', description: 'Finish 100 books', category: '📚 Books', target: 100, unit: 'books', field: 'finished', type: 'ge' },
  { id: 'double_century', name: 'Double Century', description: 'Finish 200 books', category: '📚 Books', target: 200, unit: 'books', field: 'finished', type: 'ge' },

  // 📄 Pages Tiers
  { id: 'page_turner', name: 'Page Turner', description: 'Read 1,000 pages', category: '📄 Pages', target: 1000, unit: 'pages', field: 'totalPages', type: 'ge' },
  { id: 'marathon_reader', name: 'Marathon Reader', description: 'Read 5,000 pages', category: '📄 Pages', target: 5000, unit: 'pages', field: 'totalPages', type: 'ge' },
  { id: 'page_10k', name: '10K Pages', description: 'Read 10,000 pages', category: '📄 Pages', target: 10000, unit: 'pages', field: 'totalPages', type: 'ge' },
  { id: 'page_25k', name: '25K Pages', description: 'Read 25,000 pages', category: '📄 Pages', target: 25000, unit: 'pages', field: 'totalPages', type: 'ge' },
  { id: 'page_50k', name: '50K Pages', description: 'Read 50,000 pages', category: '📄 Pages', target: 50000, unit: 'pages', field: 'totalPages', type: 'ge' },

  // 🔥 Streak
  { id: 'streak_starter', name: 'Streak Starter', description: 'Read for 1 month in a row', category: '🔥 Streak', target: 1, unit: 'streak', field: 'currentStreak', type: 'ge' },
  { id: 'consistent_reader', name: 'Consistent Reader', description: 'Read for 3 months in a row', category: '🔥 Streak', target: 3, unit: 'streak', field: 'currentStreak', type: 'ge' },
  { id: 'half_year_streak', name: 'Half Year Streak', description: 'Read for 6 months in a row', category: '🔥 Streak', target: 6, unit: 'streak', field: 'currentStreak', type: 'ge' },
  { id: 'year_round', name: 'Year-Round Reader', description: 'Read for 12 months in a row', category: '🔥 Streak', target: 12, unit: 'streak', field: 'currentStreak', type: 'ge' },

  // ⭐ Ratings
  { id: 'rating_enthusiast', name: 'Rating Enthusiast', description: 'Rate 5 books', category: '⭐ Ratings', target: 5, unit: 'books', field: 'rated', type: 'ge' },
  { id: 'rating_pro', name: 'Rating Pro', description: 'Rate 10 books', category: '⭐ Ratings', target: 10, unit: 'books', field: 'rated', type: 'ge' },
  { id: 'rating_master', name: 'Rating Master', description: 'Rate 25 books', category: '⭐ Ratings', target: 25, unit: 'books', field: 'rated', type: 'ge' },
  { id: 'five_star_only', name: 'Five-Star Fan', description: 'Give a 5-star rating', category: '⭐ Ratings', target: 5, unit: 'rating', field: 'topRated', type: 'ge01' },

  // 🌍 Diversity
  { id: 'genre_explorer', name: 'Genre Explorer', description: 'Read 3 different genres', category: '🌍 Diversity', target: 3, unit: 'genres', field: 'genreCount', type: 'ge' },
  { id: 'genre_master', name: 'Genre Master', description: 'Read 5 different genres', category: '🌍 Diversity', target: 5, unit: 'genres', field: 'genreCount', type: 'ge' },
  { id: 'genre_king', name: 'Genre King', description: 'Read 10 different genres', category: '🌍 Diversity', target: 10, unit: 'genres', field: 'genreCount', type: 'ge' },
  { id: 'author_explorer', name: 'Author Explorer', description: 'Read 5 different authors', category: '🌍 Diversity', target: 5, unit: 'authors', field: 'authorCount', type: 'ge' },
  { id: 'author_collector', name: 'Author Collector', description: 'Read 10 different authors', category: '🌍 Diversity', target: 10, unit: 'authors', field: 'authorCount', type: 'ge' },

  // 📏 Milestones
  { id: 'tome_reader', name: 'Tome Reader', description: 'Finish a book with 500+ pages', category: '📏 Milestones', target: 500, unit: 'book', field: 'longestBook', type: 'ge01' },
  { id: 'war_and_peace', name: 'War & Peace', description: 'Finish a book with 1000+ pages', category: '📏 Milestones', target: 1000, unit: 'book', field: 'longestBook', type: 'ge01' },
  { id: 'planned_reader', name: 'Always Planning', description: 'Have 5 books in your planned list', category: '📏 Milestones', target: 5, unit: 'books', field: 'planned', type: 'ge' },
  { id: 'collector', name: 'Book Collector', description: 'Have 20 books in your library', category: '📏 Milestones', target: 20, unit: 'books', field: 'total', type: 'ge' },
  { id: 'library', name: 'Personal Library', description: 'Have 50 books in your library', category: '📏 Milestones', target: 50, unit: 'books', field: 'total', type: 'ge' },

  // ⚡ Speed & Pace
  { id: 'speed_demon', name: 'Speed Demon', description: 'Finish a book in under 3 days', category: '⚡ Speed', target: 3, unit: 'book', field: 'fastestFinish', type: 'lt' },
  { id: 'slow_burn', name: 'Slow Burn', description: 'Take 30+ days to finish a book', category: '⚡ Speed', target: 30, unit: 'book', field: 'slowestFinish', type: 'ge01' },
  { id: 'marathon_month', name: 'Marathon Month', description: 'Finish 5 books in a single month', category: '⚡ Speed', target: 5, unit: 'books', field: 'maxPerMonth', type: 'ge' },

  // 💎 Engagement
  { id: 'completionist', name: 'Completionist', description: 'Finish 90%+ of books you start', category: '💎 Engagement', target: 90, unit: '%', field: 'completionRate', type: 'completionist' },
  { id: 'genre_specialist', name: 'Genre Specialist', description: 'Read 5 books from the same genre', category: '💎 Engagement', target: 5, unit: 'books', field: 'maxGenreCount', type: 'ge' },

  // 📖 Book Size Variety
  { id: 'short_and_sweet', name: 'Short & Sweet', description: 'Finish a book under 150 pages', category: '📖 Book Size', target: 150, unit: 'book', field: 'shortestBook', type: 'range' },
  { id: 'heavy_hitter', name: 'Heavy Hitter', description: 'Finish a book with 300+ pages', category: '📖 Book Size', target: 300, unit: 'book', field: 'longestBook', type: 'ge01' },
  { id: 'epic_saga', name: 'Epic Saga', description: 'Finish a book with 750+ pages', category: '📖 Book Size', target: 750, unit: 'book', field: 'longestBook', type: 'ge01' },
];

export function computeAchievements(s: AchievementStats): AchievementResult[] {
  return ACHIEVEMENT_DEFS.map(def => {
    const v = s[def.field];
    let unlocked = false;
    let progress = 0;

    switch (def.type) {
      case 'ge':
        unlocked = v >= def.target;
        progress = Math.min(v, def.target);
        break;
      case 'ge01':
        unlocked = v >= def.target;
        progress = v >= def.target ? 1 : 0;
        break;
      case 'lt':
        unlocked = v < def.target;
        progress = v < def.target ? 1 : 0;
        break;
      case 'range':
        unlocked = v > 0 && v < def.target;
        progress = (v > 0 && v < def.target) ? 1 : 0;
        break;
      case 'completionist':
        unlocked = s.completionRate >= 0.9 && s.finished >= 5;
        progress = Math.min(Math.round(s.completionRate * 100), 90);
        break;
    }

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      unlocked,
      unlocked_at: null as string | null,
      progress,
      target: def.target,
      unit: def.unit,
    };
  });
}
