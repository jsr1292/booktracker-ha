import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import type { Book } from './types';
import { getBooks, createBook, updateBook, deleteBook, getStats, exportBooks, importBooks } from './lib/db';
import type { Stats } from './lib/db';
import { isLoggedIn, getUsername, logout, setOnAuthExpired, changePassword } from './lib/auth';
import { fullSync, startAutoSync, stopAutoSync, onBookChange } from './lib/sync';
import BookList from './components/BookList';
import Dashboard from './components/Dashboard';
import BottomNav from './components/BottomNav';
import AuthScreen from './components/AuthScreen';
import SyncStatus from './components/SyncStatus';
import PullToRefresh from './components/PullToRefresh';
import { SkeletonHero, SkeletonStats, SkeletonList } from './components/SkeletonCard';
import AchievementConfetti from './components/AchievementConfetti';
import BottomSheet from './components/BottomSheet';
import BookDetailSheet from './components/BookDetailSheet';
import { lookupISBN } from './api/bookLookup';

// Lazy-load heavy components to reduce initial bundle size
const Achievements = lazy(() => import('./components/Achievements'));
const ReadingTimeline = lazy(() => import('./components/ReadingTimeline'));
const Recommendations = lazy(() => import('./components/Recommendations'));
const BarcodeScanner = lazy(() => import('./components/BarcodeScanner'));
const BookForm = lazy(() => import('./components/BookForm'));
const BookDetail = lazy(() => import('./components/BookDetail'));

// ── Loading fallbacks for lazy components ──────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
      <div style={{ color: 'var(--text2)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
    </div>
  );
}

function ModalLoader() {
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ color: 'var(--text2)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPass !== confirm) { setError('Passwords don\'t match'); return; }
    if (newPass.length < 8) { setError('New password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await changePassword(current, newPass);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em' }}>CHANGE PASSWORD</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>
      {success ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#68d391', fontSize: 13 }}>✓ Password updated!</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--text2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Current Password</label>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'var(--border)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 16, outline: 'none' }} />
          <label style={{ display: 'block', fontSize: 10, color: 'var(--text2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>New Password</label>
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} required minLength={8} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'var(--border)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 16, outline: 'none' }} />
          <label style={{ display: 'block', fontSize: 10, color: 'var(--text2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Confirm New Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'var(--border)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 16, outline: 'none' }} />
          {error && <div style={{ fontSize: 11, color: '#fc8181', marginBottom: 12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: loading ? 'rgba(201,168,76,0.2)' : 'linear-gradient(135deg, #c9a84c, #b8943f)', border: 'none', borderRadius: 8, color: 'var(--bg)', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.1em' }}>{loading ? 'Updating...' : 'UPDATE PASSWORD'}</button>
        </form>
      )}
    </div>
  );
}

type Page = 'dashboard' | 'books' | 'recommendations' | 'achievements' | 'timeline';

const PAGE_ORDER: Page[] = ['dashboard', 'books', 'recommendations', 'achievements', 'timeline'];

function getSlideDirection(from: Page | null, to: Page): 'left' | 'right' | 'none' {
  if (!from) return 'none';
  const fromIdx = PAGE_ORDER.indexOf(from);
  const toIdx = PAGE_ORDER.indexOf(to);
  if (toIdx > fromIdx) return 'left';  // forward: slide from right
  if (toIdx < fromIdx) return 'right'; // back: slide from left
  return 'none';
}

// ── Theme ──────────────────────────────────────────────────────────────
const THEME_KEY = 'booktracker_theme';

function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [page, setPage] = useState<Page>('dashboard');
  const [prevPage, setPrevPage] = useState<Page | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | 'none'>('none');
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'reading' | 'finished' | 'abandoned' | 'planned'>('all');
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | undefined>();
  const [initialFormData, setInitialFormData] = useState<any>(undefined);
  const [showScanner, setShowScanner] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [showImporting, setShowImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [prevUnlockedIds, setPrevUnlockedIds] = useState<string[]>([]);
  const [toastAchievement, setToastAchievement] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [confettiTarget, setConfettiTarget] = useState<{ x: number; y: number } | null>(null);
  const [toastRef, setToastRef] = useState<HTMLDivElement | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Service Worker Registration + update detection
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                setSwUpdateAvailable(true);
              }
            });
          }
        });
      }).catch(() => {});
    }
  }, []);

  const fetchBooks = useCallback(async () => {
    try {
      const data = await getBooks();
      setBooks(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err.message);
    }
  }, []);

  // Detect new achievement unlocks
  useEffect(() => {
    if (!stats) return;
    const currentIds = stats.achievements.filter(a => a.unlocked).map(a => a.id);
    const newIds = currentIds.filter(id => !prevUnlockedIds.includes(id));
    if (newIds.length > 0 && prevUnlockedIds.length > 0) {
      // Skip toast on initial load — only toast for real mid-session unlocks
      const newlyUnlocked = stats.achievements.find(a => a.id === newIds[0]);
      if (newlyUnlocked) {
        const iconMap: Record<string, string> = {
          first_steps: '👶', bookworm: '🐛', speed_reader: '⚡', page_turner: '📖',
          marathon_reader: '🏃', streak_starter: '🔥', consistent_reader: '📅',
          rating_enthusiast: '⭐', genre_explorer: '🗺️', century_club: '💯',
          scholar: '🎓', librarian: '📚', master_library: '👑',
        };
        setToastAchievement({ id: newlyUnlocked.id, name: newlyUnlocked.name, icon: iconMap[newlyUnlocked.id] || '🏆' });
        // Trigger confetti from the toast element
        setTimeout(() => {
          if (toastRef) {
            const rect = toastRef.getBoundingClientRect();
            setConfettiTarget({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }
          // Haptic
          try { if (navigator.vibrate) navigator.vibrate([20, 50, 20, 50, 20]); } catch {}
        }, 100);
        setTimeout(() => setToastAchievement(null), 4000);
      }
    }
    setPrevUnlockedIds(currentIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  // Apply theme class on document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // ── Auth state ────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    // Register 401 handler — auto-logout on token expiry
    setOnAuthExpired(() => {
      setIsAuthenticated(false);
      setUsername(null);
      setAuthChecked(true);
    });

    const loggedIn = isLoggedIn();
    setIsAuthenticated(loggedIn);
    setUsername(getUsername());
    setAuthChecked(true);
    if (loggedIn) {
      void fullSync();
      startAutoSync(60_000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthenticated = useCallback(async () => {
    setIsAuthenticated(true);
    setUsername(getUsername());
    await fullSync(); // Wait for initial sync before starting auto-poll
    startAutoSync(60_000);
    // Fetch books/stats after auth so the main app has data
    await Promise.all([fetchBooks(), fetchStats()]);
  }, [fetchBooks, fetchStats]);

  const handleOfflineMode = useCallback(() => {
    setIsAuthenticated(true); // Show main app
    setUsername(null); // No server user
    setAuthChecked(true);
    // Don't start sync — pure offline mode
  }, []);

  const handleLogout = useCallback(() => {
    stopAutoSync();
    logout();
    setIsAuthenticated(false);
    setUsername(null);
  }, []);

  useEffect(() => {
    Promise.all([fetchBooks(), fetchStats()]).finally(() => {
      setLoading(false);
      setIsInitialLoad(false);
    });
  }, [fetchBooks, fetchStats]);

  // iOS Install Banner Detection
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setShowIOSBanner(isIOS && !isStandalone);
  }, []);

  // ── iOS Safari Keyboard Fix ─────────────────────────────────────────────
  // iOS Safari doesn't always restore viewport height when the keyboard dismisses.
  // Use visualViewport API to detect keyboard open/close and force a re-layout.
  useEffect(() => {
    const root = document.documentElement;
    const handler = () => {
      // dynamic viewport height — accounts for on-screen keyboard
      const dvh = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
      root.style.setProperty('--doc-height', `${dvh}px`);
      // Force layout recalc — fixes iOS Safari jumpy fixed elements
      root.style.setProperty('--kb-open', window.visualViewport && window.visualViewport.height < window.innerHeight * 0.75 ? '1' : '0');
    };
    handler();
    window.visualViewport?.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);
    return () => {
      window.visualViewport?.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  // Close tools menu on outside click
  useEffect(() => {
    if (!showToolsMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-tools-menu]') || target.closest('[data-tools-toggle]')) return;
      setShowToolsMenu(false);
    };
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [showToolsMenu]);

  // Clamp ticker scroll — prevent manual scroll into blank zone
  useEffect(() => {
    const el = document.querySelector('.ticker-wrap') as HTMLElement;
    if (!el) return;
    const maxScroll = () => el.scrollWidth - el.clientWidth;
    const clamp = () => {
      if (el.scrollLeft > maxScroll() * 0.98) {
        el.scrollLeft = 0;
      }
    };
    el.addEventListener('scroll', clamp, { passive: true });
    return () => el.removeEventListener('scroll', clamp);
  }, []);

  // Page navigation with transition direction
  const navigateTo = useCallback((newPage: Page) => {
    setSlideDir(getSlideDirection(page, newPage));
    setPrevPage(page);
    setPage(newPage);
  }, [page]);

  const handleCreateBook = async (data: any) => {
    try {
      await createBook(data);
      await fetchBooks();
      await fetchStats();
      onBookChange();
      setShowForm(false);
      setInitialFormData(undefined);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateBook = async (data: any) => {
    if (!editingBook || editingBook.id == null) return;
    try {
      await updateBook(editingBook.id, data);
      await fetchBooks();
      await fetchStats();
      onBookChange();
      setEditingBook(undefined);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteBook = async (id: number) => {
    if (!window.confirm('Delete this book? This cannot be undone.')) return;
    try {
      const { haptics } = await import('./lib/haptics');
      haptics.bookDeleted();
      await deleteBook(id);
      await fetchBooks();
      await fetchStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddBook = () => {
    setEditingBook(undefined);
    setInitialFormData(undefined);
    setShowForm(true);
  };

  const handleRecommendationAdd = (data: Partial<import('./types').Book>) => {
    setEditingBook(undefined);
    setInitialFormData(data as any);
    setShowForm(true);
  };

  const handleEditBook = (book: Book) => {
    setEditingBook(book);
    setInitialFormData(undefined);
    setShowForm(true);
  };

  const handleScanDetected = async (isbn: string) => {
    setShowScanner(false);
    setScanLoading(true);
    setError(null);
    try {
      const result = await lookupISBN(isbn);
      if (result) {
        const bookData = {
          title: result.title,
          author: result.author,
          date_finished: new Date().toISOString().split('T')[0],
          pages: result.pages,
          genre: result.genre,
          cover_url: result.coverUrl,
          description: result.description,
          language: result.language,
          rating: null,
        };
        setInitialFormData(bookData);
        setShowForm(true);
      } else {
        setError(`ISBN ${isbn} not found in Google Books. Add manually.`);
        setShowForm(true);
      }
    } catch {
      setError('Book lookup failed. Add manually.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleExport = () => {
    exportBooks();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowImporting(true);
    setImportResult(null);
    try {
      const result = await importBooks(file);
      setImportResult(result);
      await fetchBooks();
      await fetchStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setShowImporting(false);
      // Reset input so same file can be re-selected
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-text">
          <span className="live-dot" />
          Loading...
        </div>
      </div>
    );
  }

  // ── Auth gate ─────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="loading-screen">
        <div className="loading-text">
          <span className="live-dot" />
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        onOfflineMode={handleOfflineMode}
      />
    );
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', color: 'var(--text)', paddingBottom: 100, fontFamily: "'JetBrains Mono', monospace", position: 'relative' }}>

      {/* ── HEADER ── */}
      <div className="site-top">
        <header className="site-header">
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="logo-mark">📚</div>
            <div className="logo-text">Book Tracker</div>
          </div>

          {/* Right side — tools menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, opacity: 0.5 }}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Sync status indicator */}
            <SyncStatus />

            {/* Scan button — primary action */}
            <button
              onClick={() => setShowScanner(true)}
              className="btn-gold"
              style={{ fontSize: 9, padding: '4px 12px' }}
              title="Scan barcode"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="4" height="5" rx="1"/>
                <rect x="17" y="3" width="4" height="5" rx="1"/>
                <rect x="3" y="16" width="4" height="5" rx="1"/>
                <rect x="17" y="16" width="4" height="5" rx="1"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
                <line x1="12" y1="5" x2="12" y2="19"/>
              </svg>
              Scan
            </button>

            {/* Tools dropdown */}
            <button
              data-tools-toggle
              onClick={(e) => { e.stopPropagation(); setShowToolsMenu(!showToolsMenu); }}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}
              title="Tools"
            >
              ⋮
            </button>
            {showToolsMenu && (
              <div data-tools-menu style={{ position: 'absolute', top: 44, right: 0, display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 140, maxWidth: 'calc(100vw - 24px)' }}>
                <button
                  onClick={() => { handleExport(); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ↓ Export JSON
                </button>
                <button
                  onClick={() => { handleImportClick(); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ↑ Import JSON
                </button>
                <button
                  onClick={() => { setShowChangePassword(true); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  🔑 Change Password
                </button>
                <button
                  onClick={() => { handleLogout(); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: '#fc8181', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ↩ Log out {username ? `(${username})` : ''}
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </header>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div className="banner-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="banner-close">×</button>
        </div>
      )}

      {/* ── PWA UPDATE BANNER ── */}
      {swUpdateAvailable && (
        <div className="banner-success" style={{ background: 'rgba(201,168,76,0.12)', borderColor: 'rgba(201,168,76,0.3)' }}>
          <span style={{ color: 'var(--gold)' }}>🔄 New version available</span>
          <button
            onClick={() => { setSwUpdateAvailable(false); window.location.reload(); }}
            style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '2px 10px', color: 'var(--gold)', cursor: 'pointer', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
          >
            Update
          </button>
          <button onClick={() => setSwUpdateAvailable(false)} className="banner-close">×</button>
        </div>
      )}

      {/* ── IMPORT RESULT ── */}
      {importResult && !showImporting && (
        <div className="banner-success">
          <span>✓ Imported {importResult.imported} books{importResult.skipped > 0 ? `, skipped ${importResult.skipped}` : ''}</span>
          <button onClick={() => setImportResult(null)} className="banner-close">×</button>
        </div>
      )}

      {/* ── IMPORTING OVERLAY ── */}
      {showImporting && (
        <div className="banner-importing">
          <div className="banner-spinner" />
          Importing books...
        </div>
      )}

      {/* ── CONTENT ── */}
      <div className="page-container">
        {page === 'dashboard' && (
          <div key={prevPage ?? 'dashboard'} className={`page-slide-${slideDir}`}>
            {isInitialLoad && !stats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <SkeletonHero />
                <SkeletonStats />
                <SkeletonList count={4} />
              </div>
            ) : (
              <PullToRefresh onRefresh={async () => { await Promise.all([fetchBooks(), fetchStats()]); }}>
                <Dashboard stats={stats} recentBooks={books.slice(0, 3)} books={books} onAddBook={handleAddBook} onBookClick={(b: any) => setDetailBook(b)} onNavigate={navigateTo} />
              </PullToRefresh>
            )}
          </div>
        )}
        {page === 'books' && (
          <div key={prevPage ?? 'books'} className={`page-slide-${slideDir}`}>
            {isInitialLoad && books.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: 120, height: 18, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 70, height: 32, borderRadius: 4 }} />
                </div>
                <SkeletonList count={5} />
              </div>
            ) : (
              <PullToRefresh onRefresh={fetchBooks}>
                <BookList books={books} onEdit={handleEditBook} onDelete={handleDeleteBook} onAdd={handleAddBook} onOpenDetail={setDetailBook} onRefresh={fetchBooks} statusFilter={statusFilter} />
              </PullToRefresh>
            )}
          </div>
        )}
        {page === 'recommendations' && (
          <div key={prevPage ?? 'recommendations'} className={`page-slide-${slideDir}`}>
            <ErrorBoundary><Suspense fallback={<PageLoader />}><Recommendations onAddBook={handleRecommendationAdd} /></Suspense></ErrorBoundary>
          </div>
        )}
        {page === 'achievements' && stats && (
          <div key={prevPage ?? 'achievements'} className={`page-slide-${slideDir}`}>
            <ErrorBoundary><Suspense fallback={<PageLoader />}><Achievements stats={stats} /></Suspense></ErrorBoundary>
          </div>
        )}
        {page === 'timeline' && (
          <div key={prevPage ?? 'timeline'} className={`page-slide-${slideDir}`}>
            <ErrorBoundary><Suspense fallback={<PageLoader />}><ReadingTimeline books={books} /></Suspense></ErrorBoundary>
          </div>
        )}
      </div>

      {/* ── FLOATING ACTION BUTTON ── */}
      <button
        onClick={handleAddBook}
        style={{
          position: 'fixed',
          bottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 12px)',
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c9a84c, #b8943f)',
          border: 'none',
          color: 'var(--bg)',
          fontSize: 24,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
        title="Add book"
      >
        +
      </button>

      {/* ── CHANGE PASSWORD MODAL ── */}
      {showChangePassword && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <BottomNav currentPage={page} onNavigate={navigateTo} />

      {/* ── BOOK FORM MODAL ── */}
      {showForm && (
        <ErrorBoundary>
        <Suspense fallback={<ModalLoader />}>
          <div className="modal-overlay">
            <div className="modal-box">
              <div className="modal-header">
                <span className="modal-title">
                  {editingBook ? 'Edit Book' : 'Add Book'}
                </span>
                <button
                  aria-label="Close"
                  onClick={() => { setShowForm(false); setEditingBook(undefined); setInitialFormData(undefined); }}
                  className="banner-close"
                >×</button>
              </div>
              <div style={{ padding: '16px 16px 20px' }}>
                {initialFormData && !editingBook && (
                  <div className="auto-fill-hint">
                    ✓ Auto-filled from ISBN scan
                  </div>
                )}
                <BookForm
                  book={editingBook}
                  initialData={!editingBook ? initialFormData : undefined}
                  onSave={editingBook ? handleUpdateBook : handleCreateBook}
                  onCancel={() => { setShowForm(false); setEditingBook(undefined); setInitialFormData(undefined); }}
                />
              </div>
            </div>
          </div>
        </Suspense>
        </ErrorBoundary>
      )}

      {/* ── BOOK DETAIL BOTTOM SHEET ── */}
      <BottomSheet
        open={!!detailBook}
        onClose={() => setDetailBook(null)}
      >
        {detailBook && (
          <BookDetailSheet
            book={detailBook}
            onEdit={() => { setDetailBook(null); handleEditBook(detailBook); }}
            onDelete={() => { if (detailBook.id != null) handleDeleteBook(detailBook.id); setDetailBook(null); }}
            onClose={() => setDetailBook(null)}
            onAddBook={handleRecommendationAdd}
          />
        )}
      </BottomSheet>

      {/* ── BARCODE SCANNER ── */}
      {showScanner && (
        <ErrorBoundary>
        <Suspense fallback={<ModalLoader />}>
          <BarcodeScanner onDetected={handleScanDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
        </ErrorBoundary>
      )}

      {/* ── SCAN LOADING ── */}
      {scanLoading && (
        <div className="scan-overlay">
          <div className="scan-overlay-inner">
            <div style={{ color: 'var(--gold)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Looking up ISBN...</div>
            <div style={{ width: 120, height: 2, background: 'var(--card-border)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 1, animation: 'scanBar 1.5s ease-in-out infinite', width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── ACHIEVEMENT TOAST ── */}
      {toastAchievement && (
        <div
          ref={el => { setToastRef(el); }}
          className="achievement-toast"
          onClick={() => setToastAchievement(null)}
        >
          <div className="achievement-toast-icon">{toastAchievement.icon}</div>
          <div className="achievement-toast-body">
            <div className="achievement-toast-label">Achievement unlocked!</div>
            <div className="achievement-toast-name">{toastAchievement.name}</div>
          </div>
          <button className="achievement-toast-close" onClick={(e) => { e.stopPropagation(); setToastAchievement(null); }}>×</button>
        </div>
      )}

      {/* ── CONFETTI ── */}
      {confettiTarget && (
        <AchievementConfetti
          x={confettiTarget.x}
          y={confettiTarget.y}
          onComplete={() => setConfettiTarget(null)}
        />
      )}

      {/* ── iOS INSTALL BANNER ── */}
      {showIOSBanner && (
        <div className="ios-banner">
          <div className="ios-banner-icon">📱</div>
          <div className="ios-banner-body">
            <div className="ios-banner-title">Install Book Tracker</div>
            <div className="ios-banner-sub">
              Tap <span style={{ color: 'var(--gold)' }}>📱 → Add to Home Screen</span> to install
            </div>
          </div>
          <button onClick={() => setShowIOSBanner(false)} className="ios-banner-dismiss">×</button>
        </div>
      )}

      <style>{`
        @keyframes scanBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        /* ── Page slide transitions ── */
        .page-slide-left {
          animation: slideInLeft 0.25s ease-out forwards;
        }
        .page-slide-right {
          animation: slideInRight 0.25s ease-out forwards;
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* ── Skeleton shimmer ── */
        .skeleton {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 25%,
            rgba(255,255,255,0.08) 50%,
            rgba(255,255,255,0.04) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
          border-radius: 4px;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .skeleton-card {
          background: rgba(13,17,32,0.60);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 14px 16px;
        }
        .skeleton-cover { width: 48px; height: 72px; border-radius: 4px; flex-shrink: 0; }
        .skeleton-title { width: 70%; height: 14px; }
        .skeleton-author { width: 45%; height: 11px; }
        .skeleton-meta { width: 55%; height: 10px; }
        .skeleton-stars { width: 60px; height: 12px; }
        .skeleton-btn { width: 36px; height: 28px; border-radius: 3px; }
        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          .page-slide-left,
          .page-slide-right,
          .skeleton {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Error Boundary — catches crashes in lazy-loaded components ──
