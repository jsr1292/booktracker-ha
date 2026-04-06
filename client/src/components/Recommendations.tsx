import { useState, useEffect, useCallback } from 'react';
import type { Book } from '../types';
import { getBooks } from '../lib/db';
import { searchOpenLibrary, searchByGenre as olSearchByGenre, searchByAuthor as olSearchByAuthor } from '../lib/openLibrary';
import { searchGoogleBooks, searchByGenre, searchByAuthor, type GoogleBookResult } from '../lib/googleBooks';

interface Recommendation extends GoogleBookResult {}

interface Preferences {
  topGenres: { genre: string; count: number }[];
  avgPages: number;
  lengthBucket: 'short' | 'medium' | 'long';
  topAuthors: { author: string; avgRating: number }[];
  totalRated: number;
}

type FilterMode = 'genre' | 'author' | 'all';

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese'];

export default function Recommendations({ onAddBook }: { onAddBook: (book: Partial<Book>) => void }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [sections, setSections] = useState<{ title: string; books: Recommendation[]; loading: boolean }[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recommendation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('wishlist') || '[]'); }
    catch { return []; }
  });
  const [langFilter, setLangFilter] = useState<string>('all');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineError, setOfflineError] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setOfflineError(false); setFetchError(false); };
    const handleOffline = () => { setIsOnline(false); setOfflineError(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Load preferences from IndexedDB on mount
  useEffect(() => {
    getBooks({ status: 'finished' }).then(books => {
      if (!books.length) return;

      const rated = books.filter(b => b.rating != null);
      const totalRated = rated.length;

      // Genre counts
      const genreCounts: Record<string, number> = {};
      for (const b of books) {
        if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1;
      }
      const topGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Author ratings
      const authorRatings: Record<string, { total: number; count: number }> = {};
      for (const b of rated) {
        if (!b.author) continue;
        if (!authorRatings[b.author]) authorRatings[b.author] = { total: 0, count: 0 };
        authorRatings[b.author].total += b.rating ?? 0;
        authorRatings[b.author].count += 1;
      }
      const topAuthors = Object.entries(authorRatings)
        .map(([author, { total, count }]) => ({
          author,
          avgRating: Math.round((total / count) * 10) / 10,
        }))
        .filter(a => a.avgRating >= 4)
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, 3);

      // Avg pages → length bucket
      const withPages = books.filter(b => b.pages != null && b.pages > 0);
      const avgPages = withPages.length
        ? Math.round(withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length)
        : 300;
      const lengthBucket: 'short' | 'medium' | 'long' =
        avgPages < 250 ? 'short' : avgPages > 400 ? 'long' : 'medium';

      setPreferences({ topGenres, avgPages, lengthBucket, topAuthors, totalRated });
    });
  }, []);

  // Build recommendation sections from preferences
  const buildSections = useCallback((prefs: Preferences) => {
    const newSections: { title: string; books: Recommendation[]; loading: boolean }[] = [];

    if (prefs.topGenres.length) {
      const primaryGenre = prefs.topGenres[0].genre;
      newSections.push(
        { title: `Because you love ${primaryGenre}`, books: [], loading: true },
        { title: `Highly rated in your genres`, books: [], loading: true },
      );
      if (prefs.topAuthors.length) {
        newSections.push(
          { title: `More from authors you rated highly`, books: [], loading: true },
        );
      }
      if (prefs.avgPages) {
        newSections.push(
          { title: `${prefs.lengthBucket.charAt(0).toUpperCase() + prefs.lengthBucket.slice(1)} reads (~${prefs.avgPages}p avg)`, books: [], loading: true },
        );
      }
    } else {
      newSections.push({ title: 'Popular fiction', books: [], loading: true });
    }

    setSections(newSections);

    // Fetch each section in parallel
    const fetchSections = async () => {
      const genre = prefs.topGenres[0]?.genre;
      const author = prefs.topAuthors[0]?.author;
      const maxPages = prefs.lengthBucket === 'short' ? 250 : prefs.lengthBucket === 'long' ? undefined : 400;

      const fetches = [
        // Genre section — Open Library primary, Google Books fallback
        genre
          ? olSearchByGenre(genre, maxPages).catch(() => []).then(ol => ol.length ? ol : searchByGenre(genre, maxPages).catch(() => []))
          : Promise.resolve([]),
        // High-rated in genre — Open Library primary
        genre
          ? olSearchByGenre(genre, undefined, undefined, 8).catch(() => []).then(ol => ol.length ? ol : searchByGenre(genre, undefined, undefined, 8).catch(() => []))
          : Promise.resolve([]),
        // Authors — Open Library primary
        author
          ? olSearchByAuthor(author).catch(() => []).then(ol => ol.length ? ol : searchByAuthor(author).catch(() => []))
          : Promise.resolve([]),
        // Length preference — Open Library primary
        genre && maxPages
          ? olSearchByGenre(genre, maxPages).catch(() => []).then(ol => ol.length ? ol : searchByGenre(genre, maxPages).catch(() => []))
          : Promise.resolve([]),
      ];

      const results = await Promise.all(fetches);
      const anySectionHasResults = results.some(r => r.length > 0);
      if (!anySectionHasResults) setFetchError(true);
      setSections(prev => prev.map((s, i) => ({ ...s, books: results[i] || [], loading: false })));
    };

    fetchSections();
  }, []);

  useEffect(() => {
    if (preferences) {
      if (!isOnline) {
        setOfflineError(true);
        setSections([]);
        return;
      }
      setOfflineError(false);
      setFetchError(false);
      buildSections(preferences);
    }
  }, [preferences, buildSections, isOnline]);

  // Search — Open Library primary, Google Books fallback
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.length < 3) { setSearchResults([]); return; }
    if (!isOnline) return;

    setSearchLoading(true);
    searchOpenLibrary(q, 8).then(data => {
      setSearchResults(data || []);
    }).catch(() => {
      setFetchError(true);
    }).finally(() => { setSearchLoading(false); });
  }, [isOnline]);

  function addToWishlist(googleId: string) {
    setWishlist(prev => {
      const next = prev.includes(googleId) ? prev.filter(id => id !== googleId) : [...prev, googleId];
      localStorage.setItem('wishlist', JSON.stringify(next));
      return next;
    });
  }

  function handleAddBook(book: Recommendation) {
    onAddBook({
      title: book.title,
      author: book.author,
      pages: book.pages,
      genre: book.genre,
      cover_url: book.coverUrl,
      description: book.description,
      language: book.language,
      status: 'planned',
    });
  }

  const totalBooks = sections.reduce((s, sec) => s + sec.books.length, 0);

  // Filter displayed sections by language
  const filteredSections = sections.map(sec => ({
    ...sec,
    books: langFilter === 'all' ? sec.books : sec.books.filter(b => b.language === langFilter),
  })).filter(sec => sec.books.length > 0 || sec.loading);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: '#d4dce8', marginBottom: 4 }}>Discover</div>
        <div style={{ fontSize: 11, color: '#8096b4' }}>
          {searchQuery
            ? searchLoading
              ? 'Searching...'
              : `${searchResults.length} results for "${searchQuery}"`
            : preferences && !offlineError
            ? `${totalBooks} recommendations · based on your ${preferences.totalRated} rated books`
            : offlineError
            ? 'Connect to the internet for personalized recommendations'
            : 'Learning your preferences...'}
        </div>
      </div>

      {/* Offline / Error Banner */}
      {(offlineError || fetchError) && (
        <div style={{
          background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.2)',
          borderRadius: 8, padding: '16px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>
            {offlineError ? '📡' : '⚠️'}
          </div>
          <div style={{ fontSize: 13, color: '#d4dce8', marginBottom: 4, fontWeight: 600 }}>
            {offlineError ? 'No internet connection' : 'Something went wrong'}
          </div>
          <div style={{ fontSize: 11, color: '#8096b4', marginBottom: 12 }}>
            {offlineError
              ? 'Discover requires an internet connection to search Google Books.'
              : 'Could not load recommendations. Please try again.'}
          </div>
          <button
            onClick={() => {
              if (!navigator.onLine) return;
              setOfflineError(false);
              setFetchError(false);
              if (preferences) buildSections(preferences);
            }}
            style={{
              padding: '8px 20px', borderRadius: 6,
              background: 'rgba(0,209,255,0.1)', border: '1px solid rgba(0,209,255,0.3)',
              color: '#00d1ff', fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
            }}
          >
            {offlineError ? '↻ Check Connection' : '↻ Retry'}
          </button>
        </div>
      )}

      {/* Language filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#6a7a8a', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4 }}>Lang:</span>
        {['all', ...LANGUAGES].map(lang => (
          <button
            key={lang}
            onClick={() => setLangFilter(lang)}
            style={{
              fontSize: 9, padding: '4px 10px', borderRadius: 4, border: '1px solid',
              background: langFilter === lang ? 'rgba(59,130,246,0.12)' : 'transparent',
              borderColor: langFilter === lang ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              color: langFilter === lang ? '#3b82f6' : '#8096b4',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {lang === 'all' ? '🌐 All' : lang}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search any book or author..."
          style={{
            width: '100%', background: '#0d1120', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '10px 14px', color: '#d4dce8', fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#c9a84c'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {searchLoading && (
          <div style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)',
            borderTopColor: '#c9a84c', borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }} />
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (() => {
        const filtered = langFilter === 'all' ? searchResults : searchResults.filter(b => b.language === langFilter);
        return filtered.length > 0 ? (
          <>
            <SectionHeader title={`Search: "${searchQuery}"`} count={filtered.length} />
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
              {filtered.map(book => (
                <BookCard
                  key={book.googleId}
                  book={book}
                  onAdd={() => handleAddBook(book)}
                  inWishlist={wishlist.includes(book.googleId)}
                  onWishlist={() => addToWishlist(book.googleId)}
                />
              ))}
            </div>
          </>
        ) : null;
      })()}

      {/* Filter tabs */}
      {preferences && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All for you' },
            { key: 'genre', label: preferences.topGenres[0]?.genre || 'By genre' },
            { key: 'author', label: preferences.topAuthors[0]?.author?.split(' ').pop() || 'By author' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key as FilterMode)}
              style={{
                fontSize: 9, padding: '5px 12px', borderRadius: 4, border: '1px solid',
                background: activeFilter === tab.key ? 'rgba(201,168,76,0.12)' : 'transparent',
                borderColor: activeFilter === tab.key ? '#c9a84c' : 'rgba(255,255,255,0.08)',
                color: activeFilter === tab.key ? '#c9a84c' : '#8096b4',
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Genre sections */}
      {activeFilter === 'all' && filteredSections.map((section, i) => (
        <RecommendationSection
          key={i}
          section={section}
          wishlist={wishlist}
          onAdd={handleAddBook}
          onWishlist={addToWishlist}
        />
      ))}

      {/* Genre filter */}
      {activeFilter === 'genre' && preferences && (
        <GenreSection genre={preferences.topGenres[0]?.genre} wishlist={wishlist} onAdd={handleAddBook} onWishlist={addToWishlist} />
      )}

      {/* Author filter */}
      {activeFilter === 'author' && preferences && preferences.topAuthors[0] && (
        <AuthorSection author={preferences.topAuthors[0].author} wishlist={wishlist} onAdd={handleAddBook} onWishlist={addToWishlist} />
      )}

      {/* Empty state */}
      {!preferences && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8096b4', fontSize: 12 }}>
          Not enough data yet. Rate a few books to get personalized recommendations!
        </div>
      )}
    </div>
  );
}

// ── Section Components ─────────────────────────────────────────

function RecommendationSection({
  section,
  wishlist,
  onAdd,
  onWishlist,
}: {
  section: { title: string; books: Recommendation[]; loading: boolean };
  wishlist: string[];
  onAdd: (b: Recommendation) => void;
  onWishlist: (id: string) => void;
}) {
  if (section.loading) {
    return (
      <div>
        <SectionHeader title={section.title} />
        <div style={{ display: 'flex', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ width: 120, height: 200, background: 'rgba(255,255,255,0.03)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

  if (!section.books.length) return null;

  return (
    <div>
      <SectionHeader title={section.title} count={section.books.length} />
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {section.books.map(book => (
          <BookCard
            key={book.googleId}
            book={book}
            onAdd={() => onAdd(book)}
            inWishlist={wishlist.includes(book.googleId)}
            onWishlist={() => onWishlist(book.googleId)}
          />
        ))}
      </div>
    </div>
  );
}

function GenreSection({ genre, wishlist, onAdd, onWishlist }: {
  genre: string | undefined; wishlist: string[]; onAdd: (b: Recommendation) => void; onWishlist: (id: string) => void;
}) {
  const [books, setBooks] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!genre) return;
    setLoading(true);
    searchByGenre(genre, undefined, undefined, 8)
      .then(data => { setBooks(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [genre]);

  if (loading) return <div style={{ height: 200, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }} />;
  if (!books.length) return null;

  return (
    <div>
      <SectionHeader title={`${genre} — highly rated`} count={books.length} />
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {books.map(book => (
          <BookCard
            key={book.googleId}
            book={book}
            onAdd={() => onAdd(book)}
            inWishlist={wishlist.includes(book.googleId)}
            onWishlist={() => onWishlist(book.googleId)}
          />
        ))}
      </div>
    </div>
  );
}

function AuthorSection({ author, wishlist, onAdd, onWishlist }: {
  author: string; wishlist: string[]; onAdd: (b: Recommendation) => void; onWishlist: (id: string) => void;
}) {
  const [books, setBooks] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchByAuthor(author)
      .then(data => { setBooks(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [author]);

  if (loading) return <div style={{ height: 200, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }} />;
  if (!books.length) return null;

  return (
    <div>
      <SectionHeader title={`More by ${author}`} count={books.length} />
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {books.map(book => (
          <BookCard
            key={book.googleId}
            book={book}
            onAdd={() => onAdd(book)}
            inWishlist={wishlist.includes(book.googleId)}
            onWishlist={() => onWishlist(book.googleId)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Book Card ────────────────────────────────────────────────

function BookCard({
  book,
  onAdd,
  inWishlist,
  onWishlist,
}: {
  book: Recommendation;
  onAdd: () => void;
  inWishlist: boolean;
  onWishlist: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        style={{
          width: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
          cursor: 'pointer',
        }}
        onClick={() => setShowDetail(true)}
      >
        {/* Cover */}
        <div style={{ position: 'relative' }}>
          {book.coverUrl ? (
            <div style={{
              width: '100%', height: 180, background: 'rgba(255,255,255,0.04)',
              borderRadius: 6, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 36,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <img
                src={book.coverUrl}
                alt={book.title}
                loading="lazy"
                style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 6 }}
                onError={e => {
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    parent.innerHTML = '<div style="width:100%;height:180px;display:flex;align-items:center;justify-content:center;font-size:36px;border-radius:6px;background:rgba(255,255,255,0.04)">📖</div>';
                  }
                }}
              />
            </div>
          ) : (
            <div style={{
              width: '100%', height: 180, background: 'rgba(255,255,255,0.04)',
              borderRadius: 6, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 36,
            }}>📖</div>
          )}
          {/* Wishlist button */}
          <button
            onClick={e => { e.stopPropagation(); onWishlist(); }}
            style={{
              position: 'absolute', top: 4, right: 4,
              background: 'rgba(7,9,15,0.8)', border: 'none',
              borderRadius: 4, padding: '3px 5px', cursor: 'pointer',
              fontSize: 12, lineHeight: 1,
            }}
          >
            {inWishlist ? '❤️' : '🤍'}
          </button>
        </div>

        {/* Info */}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {book.title}
          </div>
          <div style={{ fontSize: 9, color: '#8096b4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {book.author}
          </div>
          {book.rating && (
            <div style={{ fontSize: 9, color: '#c9a84c', marginTop: 2 }}>
              {'★'.repeat(Math.round(book.rating))} {book.rating.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 14, padding: 20 }}>
              {book.coverUrl && (
                <img src={book.coverUrl} alt={book.title} style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: '#d4dce8', marginBottom: 4, lineHeight: 1.3 }}>{book.title}</div>
                <div style={{ fontSize: 11, color: '#8096b4', marginBottom: 8 }}>{book.author}</div>
                {book.rating && <div style={{ fontSize: 12, color: '#c9a84c' }}>{'★'.repeat(Math.round(book.rating))} {book.rating.toFixed(1)} / 5</div>}
                <div style={{ fontSize: 10, color: '#6a7a8a', marginTop: 4 }}>
                  {book.pages && `${book.pages}p`} {book.year && `· ${book.year}`} {book.genre && `· ${book.genre}`}
                </div>
              </div>
            </div>
            {book.description && (
              <div style={{ padding: '0 20px 16px', fontSize: 11, color: '#b0c0d8', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>
                {book.description.slice(0, 400)}{book.description.length > 400 ? '...' : ''}
              </div>
            )}
            <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
              <button
                onClick={() => { onAdd(); setShowDetail(false); }}
                style={{ flex: 1, padding: '9px', borderRadius: 6, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                + Add to Library
              </button>
              <button
                onClick={() => setShowDetail(false)}
                style={{ padding: '9px 14px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8096b4', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: '#d4dce8', fontWeight: 600, letterSpacing: '0.05em' }}>{title}</span>
      {count !== undefined && <span style={{ fontSize: 9, color: '#6a7a8a' }}>{count} books</span>}
    </div>
  );
}
