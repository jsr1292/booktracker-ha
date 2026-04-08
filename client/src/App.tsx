import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import type { Book } from './types';
import { getBooks, createBook, updateBook, deleteBook, getStats, exportBooks, importBooks } from './lib/db';
import type { Stats } from './lib/db';
import BookList from './components/BookList';
import Dashboard from './components/Dashboard';
import BottomNav from './components/BottomNav';
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
      <div style={{ color: '#8096b4', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
    </div>
  );
}

function ModalLoader() {
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ color: '#8096b4', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
      </div>
    </div>
  );
}

type Page = 'dashboard' | 'books' | 'recommendations' | 'achievements' | 'timeline';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
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
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
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

  useEffect(() => {
    Promise.all([fetchBooks(), fetchStats()]).finally(() => setLoading(false));
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
    const handler = () => setShowToolsMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
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

  const handleCreateBook = async (data: any) => {
    try {
      await createBook(data);
      await fetchBooks();
      await fetchStats();
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
      setEditingBook(undefined);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteBook = async (id: number) => {
    try {
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

  return (
    <div style={{ background: '#07090f', minHeight: '100dvh', color: '#d4dce8', paddingBottom: 100, fontFamily: "'JetBrains Mono', monospace", position: 'relative' }}>

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
            <span style={{ fontSize: 10, color: '#a0aec0', letterSpacing: '0.1em' }}>{books.length} books</span>

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
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#a0aec0', fontSize: 14, lineHeight: 1 }}
              title="Tools"
            >
              ⋮
            </button>
            {showToolsMenu && (
              <div style={{ position: 'absolute', top: 44, right: 12, display: 'flex', flexDirection: 'column', gap: 0, background: '#151a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 120 }}>
                <button
                  onClick={() => { handleExport(); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: '#a0aec0', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ↓ Export JSON
                </button>
                <button
                  onClick={() => { handleImportClick(); setShowToolsMenu(false); }}
                  style={{ background: 'none', border: 'none', color: '#a0aec0', padding: '10px 16px', cursor: 'pointer', fontSize: 11, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ↑ Import JSON
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
          <span style={{ color: '#c9a84c' }}>🔄 New version available</span>
          <button
            onClick={() => { setSwUpdateAvailable(false); window.location.reload(); }}
            style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '2px 10px', color: '#c9a84c', cursor: 'pointer', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
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
        {page === 'dashboard' && <div key="dashboard" className="fade-in"><Dashboard stats={stats} recentBooks={books.slice(0, 3)} books={books} onAddBook={handleAddBook} /></div>}
        {page === 'books' && <div key="books" className="fade-in"><BookList books={books} onEdit={handleEditBook} onDelete={handleDeleteBook} onAdd={handleAddBook} onOpenDetail={setDetailBook} statusFilter={statusFilter} /></div>}
        {page === 'recommendations' && <div key="recommendations" className="fade-in"><ErrorBoundary><Suspense fallback={<PageLoader />}><Recommendations onAddBook={handleRecommendationAdd} /></Suspense></ErrorBoundary></div>}
        {page === 'achievements' && stats && <div key="achievements" className="fade-in"><ErrorBoundary><Suspense fallback={<PageLoader />}><Achievements stats={stats} /></Suspense></ErrorBoundary></div>}
        {page === 'timeline' && <div key="timeline" className="fade-in"><ErrorBoundary><Suspense fallback={<PageLoader />}><ReadingTimeline books={books} /></Suspense></ErrorBoundary></div>}
      </div>

      {/* ── FLOATING ACTION BUTTON ── */}
      <button
        onClick={handleAddBook}
        style={{
          position: 'fixed',
          bottom: 76,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c9a84c, #b8943f)',
          border: 'none',
          color: '#07090f',
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

      {/* ── BOTTOM NAV ── */}
      <BottomNav currentPage={page} onNavigate={setPage} />

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
              <div style={{ padding: 20 }}>
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

      {/* ── BOOK DETAIL MODAL ── */}
      {detailBook && (
        <ErrorBoundary>
        <Suspense fallback={<ModalLoader />}>
          <BookDetail
            book={detailBook}
            onEdit={() => { setDetailBook(null); handleEditBook(detailBook); }}
            onDelete={() => { if (detailBook.id != null) handleDeleteBook(detailBook.id); setDetailBook(null); }}
            onClose={() => setDetailBook(null)}
          />
        </Suspense>
        </ErrorBoundary>
      )}

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
            <div style={{ color: '#c9a84c', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Looking up ISBN...</div>
            <div style={{ width: 120, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#c9a84c', borderRadius: 1, animation: 'scanBar 1.5s ease-in-out infinite', width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── iOS INSTALL BANNER ── */}
      {showIOSBanner && (
        <div className="ios-banner">
          <div className="ios-banner-icon">📱</div>
          <div className="ios-banner-body">
            <div className="ios-banner-title">Install Book Tracker</div>
            <div className="ios-banner-sub">
              Tap <span style={{ color: '#c9a84c' }}>📱 → Add to Home Screen</span> to install
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
      `}</style>
    </div>
  );
}

// ── Error Boundary — catches crashes in lazy-loaded components ──
