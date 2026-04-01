import type { ReactNode } from 'react';
import Navigation from './Navigation';
import DarkModeToggle from './DarkModeToggle';

type LayoutProps = { children: ReactNode; currentPage: string; onNavigate: (page: string) => void };

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="fixed left-0 top-0 h-full w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>📚</span>
            <span className="text-indigo-600 dark:text-indigo-400">Book Tracker</span>
          </h1>
        </div>
        <Navigation currentPage={currentPage} onNavigate={onNavigate} />
        <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-700">
          <DarkModeToggle />
        </div>
      </aside>
      <main className="ml-56 p-6">
        {children}
      </main>
    </div>
  );
}
