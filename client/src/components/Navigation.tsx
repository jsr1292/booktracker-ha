import type { ReactNode } from 'react';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface NavLink {
  id: string;
  label: string;
  icon: ReactNode;
}

const links: NavLink[] = [
  {
    id: 'books',
    label: 'Books',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
    ),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'achievements',
    label: 'Achievements',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744l.311 1.242 1.105.592a1 1 0 010 1.788l-1.105.593-.311 1.242a1 1 0 01-1.934 0L10.832 6.96 9.727 6.366a1 1 0 010-1.788l1.105-.592.311-1.242A1 1 0 0112 2z" clipRule="evenodd" />
        <path d="M12 12a4 4 0 00-4 4v1a1 1 0 001 1h6a1 1 0 001-1v-1a4 4 0 00-4-4z" />
      </svg>
    ),
  },
];

export default function Navigation({ currentPage, onNavigate }: NavigationProps) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {links.map((link) => {
        const isActive = currentPage === link.id;
        return (
          <button
            key={link.id}
            onClick={() => onNavigate(link.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            }`}
          >
            {link.icon}
            {link.label}
          </button>
        );
      })}
    </nav>
  );
}
