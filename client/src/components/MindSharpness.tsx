import type { Stats } from '../types';

interface MindSharpnessProps {
  stats: Stats;
}

export default function MindSharpness({ stats }: MindSharpnessProps) {
  const { mind_sharpness } = stats;
  const clamped = Math.min(100, Math.max(0, mind_sharpness));

  const getProgressColor = (percent: number): string => {
    if (percent < 33) return 'from-red-500 to-orange-500';
    if (percent < 66) return 'from-orange-500 to-yellow-500';
    return 'from-green-500 to-emerald-500';
  };

  const getTextColor = (percent: number): string => {
    if (percent < 33) return 'text-red-600 dark:text-red-400';
    if (percent < 66) return 'text-orange-600 dark:text-orange-400';
    return 'text-green-600 dark:text-green-400';
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
      <h3 className="mb-4 text-center text-lg font-semibold text-gray-800 dark:text-gray-200">
        Mind Sharpness
      </h3>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-36 w-36">
          <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(clamped / 100) * 314.16} 314.16`}
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={clamped < 33 ? '#ef4444' : clamped < 66 ? '#f97316' : '#22c55e'} />
                <stop offset="100%" stopColor={clamped < 33 ? '#f97316' : clamped < 66 ? '#eab308' : '#10b981'} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${getTextColor(clamped)}`}>
              {Math.round(clamped)}%
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Formula: min(100, 10 x sqrt(total books))
        </p>
      </div>
    </div>
  );
}
