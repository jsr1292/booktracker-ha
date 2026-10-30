import { useState, useEffect, useCallback, useRef } from 'react';
import type { Book } from '../types';
import ModalPortal from './ModalPortal';
import { getBooks } from '../lib/db';
import {
  fetchTrending,
  fetchSubject,
  searchOpenLibrary,
  searchByGenre as olSearchByGenre,
  searchByAuthor as olSearchByAuthor,
  fetchWorkDetails,
  type OLBook,
  type OLSearchResult,
} from '../lib/openLibrary';
type DiscoveryTab = 'trending' | 'genres' | 'foryou';

type Recommendation = OLBook | OLSearchResult;

interface Preferences {
  topGenres: { genre: string; count: number }[];
  avgPages: number;
  lengthBucket: 'short' | 'medium' | 'long';
  topAuthors: { author: string; avgRating: number }[];
  totalRated: number;
}

type FilterMode = 'genre' | 'author' | 'all';

const GENRES = [
  'Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
  'Romance', 'Thriller', 'History', 'Biography',
  'Science', 'Philosophy',
];

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese'];

export default function Recommendations({ books, onAddBook, onQuickAdd }: { books: Book[]; onAddBook: (book: Partial<Book>) => void; onQuickAdd: (book: Partial<Book>) => Promise<void> }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [sections, setSections] = useState<{ title: string; books: Recommendation[]; loading: boolean }[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recommendation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [langFilter, setLangFilter] = useState<string>('all');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineError, setOfflineError] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Discovery tab state
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('trending');
  const [trendingBooks, setTrendingBooks] = useState<OLBook[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string>('Fiction');
  const [genreBooks, setGenreBooks] = useState<OLBook[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState(false);

  // Hearts used to save here; they add to Planned now.
  useEffect(() => { try { localStorage.removeItem('wishlist'); } catch { /* storage unavailable */ } }, []);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setOfflineError(false); setFetchError(false); };
    const handleOffline = () => { setIsOnline(false); setOfflineError(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    getBooks({ status: 'finished' }).then(books => {
      if (!books.length) return;
      const rated = books.filter(b => b.rating != null);
      const totalRated = rated.length;
      const genreCounts: Record<string, number> = {};
      for (const b of books) { if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1; }
      const topGenres = Object.entries(genreCounts).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count).slice(0, 5);
      const authorRatings: Record<string, { total: number; count: number }> = {};
      for (const b of rated) {
        if (!b.author) continue;
        if (!authorRatings[b.author]) authorRatings[b.author] = { total: 0, count: 0 };
        authorRatings[b.author].total += b.rating ?? 0;
        authorRatings[b.author].count += 1;
      }
      const topAuthors = Object.entries(authorRatings).map(([author, { total, count }]) => ({ author, avgRating: Math.round((total / count) * 10) / 10 })).filter(a => a.avgRating >= 4).sort((a, b) => b.avgRating - a.avgRating).slice(0, 3);
      const withPages = books.filter(b => b.pages != null && b.pages > 0);
      const avgPages = withPages.length ? Math.round(withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length) : 300;
      const lengthBucket: 'short' | 'medium' | 'long' = avgPages < 250 ? 'short' : avgPages > 400 ? 'long' : 'medium';
      setPreferences({ topGenres, avgPages, lengthBucket, topAuthors, totalRated });
    });
  }, []);

  const buildSections = useCallback((prefs: Preferences) => {
    const newSections: { title: string; books: Recommendation[]; loading: boolean }[] = [];
    if (prefs.topGenres.length) {
      const primaryGenre = prefs.topGenres[0].genre;
      newSections.push({ title: `Because you love ${primaryGenre}`, books: [], loading: true });
      newSections.push({ title: `Highly rated in your genres`, books: [], loading: true });
      if (prefs.topAuthors.length) newSections.push({ title: `More from authors you rated highly`, books: [], loading: true });
      if (prefs.avgPages) newSections.push({ title: `${prefs.lengthBucket.charAt(0).toUpperCase() + prefs.lengthBucket.slice(1)} reads (~${prefs.avgPages}p avg)`, books: [], loading: true });
    } else {
      // No preferences yet — show popular genres as fallback
      newSections.push({ title: 'Popular in Fiction', books: [], loading: true });
      newSections.push({ title: 'Popular in Fantasy', books: [], loading: true });
      newSections.push({ title: 'Popular in Science', books: [], loading: true });
    }
    setSections(newSections);
    const fetchSections = async () => {
      const genre = prefs.topGenres[0]?.genre;
      const author = prefs.topAuthors[0]?.author;
      const maxPages = prefs.lengthBucket === 'short' ? 250 : prefs.lengthBucket === 'long' ? undefined : 400;
      const hasPrefs = prefs.topGenres.length > 0;
      const fetches = hasPrefs ? [
        genre ? olSearchByGenre(genre, maxPages).catch(() => []) : Promise.resolve([]),
        genre ? olSearchByGenre(genre, undefined, undefined, 8).catch(() => []) : Promise.resolve([]),
        author ? olSearchByAuthor(author).catch(() => []) : Promise.resolve([]),
        genre && maxPages ? olSearchByGenre(genre, maxPages).catch(() => []) : Promise.resolve([]),
      ] : [
        // Fallback: fetch popular books from common genres
        olSearchByGenre('fiction').catch(() => []),
        olSearchByGenre('fantasy').catch(() => []),
        olSearchByGenre('science').catch(() => []),
        Promise.resolve([]),
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
      if (!isOnline) { setOfflineError(true); setSections([]); return; }
      setOfflineError(false);
      setFetchError(false);
      buildSections(preferences);
    }
  }, [preferences, buildSections, isOnline]);

  // Trending fetch
  useEffect(() => {
    if (activeTab !== 'trending') return;
    setTrendingLoading(true);
    setTrendingError(false);
    fetchTrending(20)
      .then(data => { setTrendingBooks(data); setTrendingLoading(false); })
      .catch(() => { setTrendingError(true); setTrendingLoading(false); });
  }, [activeTab]);

  // Genre fetch
  useEffect(() => {
    if (activeTab !== 'genres') return;
    setGenreLoading(true);
    setGenreError(false);
    fetchSubject(selectedGenre, 24)
      .then(data => { setGenreBooks(data.works); setGenreLoading(false); })
      .catch(() => { setGenreError(true); setGenreLoading(false); });
  }, [activeTab, selectedGenre]);

  // Debounce + last-write-wins. This input previously fired one Open Library
  // request per keystroke with no cancellation, so typing "brandon sanderson"
  // put 15 requests in flight at once; whichever landed last won, which was not
  // necessarily the one matching what had been typed.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchResults([]);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    // Invalidate any in-flight request: its results are already stale.
    const seq = ++searchSeqRef.current;

    if (q.length < 3) { setSearchResults([]); setSearchLoading(false); return; }
    if (!isOnline) return;

    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      // 'q' rather than 'title', to match what the placeholder promises. On
      // title= a search for "brandon sanderson" returned books with his name in
      // the title ("Brandon Sanderson's White Sand", "Sampler") instead of his
      // novels. Pure-title searches rank the same either way.
      searchOpenLibrary(q, 8, 'q')
        .then(data => { if (seq === searchSeqRef.current) setSearchResults(data || []); })
        .catch(() => { if (seq === searchSeqRef.current) setFetchError(true); })
        .finally(() => { if (seq === searchSeqRef.current) setSearchLoading(false); });
    }, 300);
  }, [isOnline]);

  function handleAddBook(book: Recommendation) {
    onAddBook({ title: book.title, author: book.author, pages: book.pages, genre: book.genre, cover_url: book.coverUrl, description: book.description, language: book.language, openlibrary_key: book.key, status: 'planned' });
  }
  const cardProps = { libraryBooks: books, onAdd: handleAddBook, onQuickAdd };

  const totalBooks = sections.reduce((s, sec) => s + sec.books.length, 0);
  const tabBooks = activeTab === 'trending' ? trendingBooks : activeTab === 'genres' ? genreBooks : activeFilter === 'all' ? sections.flatMap(sec => sec.books) : [];
  const visibleLanguages = (searchQuery && searchResults.some(book => book.language)) || tabBooks.some(book => book.language);
  const tabLanguage = tabBooks.some(book => book.language) ? langFilter : 'all';
  const filteredSections = sections.map(sec => ({ ...sec, books: tabLanguage === 'all' ? sec.books : sec.books.filter(b => b.language === tabLanguage) })).filter(sec => sec.books.length > 0 || sec.loading);

  useEffect(() => {
    let isTouching = false;
    const onTouchStart = () => { isTouching = true; };
    const onTouchEnd = () => { setTimeout(() => { isTouching = false; }, 100); };
    const handleScroll = () => {
      if (!isTouching) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) { (active as HTMLElement).blur(); }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd); window.removeEventListener('scroll', handleScroll); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>Discover</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {searchQuery ? (searchLoading ? 'Searching...' : `${searchResults.length} results for "${searchQuery}"`)
            : activeTab === 'foryou' && preferences && !offlineError ? `${totalBooks} recommendations · based on your ${preferences.totalRated} rated books`
            : offlineError ? 'Connect to the internet to discover books' : 'Find your next book'}
        </div>
      </div>

      {(offlineError || fetchError) && (
        <div style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.2)', borderRadius: 8, padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{offlineError ? '📡' : '⚠️'}</div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 600 }}>{offlineError ? 'No internet connection' : 'Something went wrong'}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>
            {offlineError ? 'Discover requires an internet connection to search Open Library.' : 'Could not load recommendations. Please try again.'}
          </div>
          <button
            onClick={() => { if (!navigator.onLine) return; setOfflineError(false); setFetchError(false); if (preferences) buildSections(preferences); }}
            style={{ padding: '8px 20px', borderRadius: 6, background: 'rgba(0,209,255,0.1)', border: '1px solid rgba(0,209,255,0.3)', color: '#00d1ff', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em' }}
          >
            {offlineError ? '↻ Check Connection' : '↻ Retry'}
          </button>
        </div>
      )}

      {visibleLanguages && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 4 }}>Lang:</span>
        {['all', ...LANGUAGES].map(lang => (
          <button key={lang} onClick={() => setLangFilter(lang)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid', background: langFilter === lang ? 'rgba(59,130,246,0.12)' : 'transparent', borderColor: langFilter === lang ? '#3b82f6' : 'var(--card-border)', color: langFilter === lang ? '#3b82f6' : 'var(--text2)', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', letterSpacing: '0.08em', transition: 'all 0.15s' }}>
            {lang === 'all' ? '🌐 All' : lang}
          </button>
        ))}
      </div>}

      <div style={{ position: 'relative' }}>
        <input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Search any book or author..."
          style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--card-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--gold)'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--card-border)'}
        />
        {searchLoading && <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Discovery Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--card-border)', paddingBottom: 0 }}>
        {[{ key: 'trending', label: '🔥 Trending' }, { key: 'genres', label: '📚 Browse' }, { key: 'foryou', label: '✨ For You' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as DiscoveryTab)} style={{ fontSize: 11, padding: '8px 14px', border: 'none', borderBottom: '2px solid', background: 'transparent', borderBottomColor: activeTab === tab.key ? 'var(--gold)' : 'transparent', color: activeTab === tab.key ? 'var(--gold)' : 'var(--text2)', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', letterSpacing: '0.08em', transition: 'all 0.15s', marginBottom: -1 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {searchResults.length > 0 && (() => {
        const filtered = langFilter === 'all' || !searchResults.some(book => book.language) ? searchResults : searchResults.filter(b => b.language === langFilter);
        return filtered.length > 0 ? <div><SectionHeader title={`Search: "${searchQuery}"`} count={filtered.length} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, paddingBottom: 8 }}>{filtered.map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}</div></div> : null;
      })()}

      {/* TRENDING TAB */}
      {activeTab === 'trending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{trendingLoading ? 'Loading popular books...' : `${trendingBooks.length} books trending now`}</div>
          {trendingLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, paddingBottom: 8 }}>
              {[1,2,3,4,5].map(i => <div key={i} style={{ minWidth: 0, height: 190, background: 'var(--border)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
          )}
          {trendingError && !trendingLoading && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text2)', fontSize: 11 }}>
              Could not load trending books.
              <button onClick={() => { setTrendingError(false); setTrendingLoading(true); fetchTrending(20).then(d => { setTrendingBooks(d); setTrendingLoading(false); }).catch(() => { setTrendingError(true); setTrendingLoading(false); }); }} style={{ display: 'block', margin: '8px auto 0', padding: '6px 16px', borderRadius: 4, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>↻ Retry</button>
            </div>
          )}
          {!trendingLoading && !trendingError && trendingBooks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {trendingBooks.filter(book => tabLanguage === 'all' || book.language === tabLanguage).map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}
            </div>
          )}
        </div>
      )}

      {/* BROWSE GENRES TAB */}
      {activeTab === 'genres' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GENRES.map(genre => (
              <button key={genre} onClick={() => setSelectedGenre(genre)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: '1px solid', background: selectedGenre === genre ? 'rgba(201,168,76,0.12)' : 'transparent', borderColor: selectedGenre === genre ? 'var(--gold)' : 'var(--card-border)', color: selectedGenre === genre ? 'var(--gold)' : 'var(--text2)', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', letterSpacing: '0.08em', transition: 'all 0.15s' }}>
                {genre}
              </button>
            ))}
          </div>
          {genreLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, paddingBottom: 8 }}>
              {[1,2,3,4,5,6].map(i => <div key={i} style={{ minWidth: 0, height: 190, background: 'var(--border)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
          )}
          {genreError && !genreLoading && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text2)', fontSize: 11 }}>
              Could not load {selectedGenre} books.
              <button onClick={() => { setGenreError(false); setGenreLoading(true); fetchSubject(selectedGenre, 24).then(d => { setGenreBooks(d.works); setGenreLoading(false); }).catch(() => { setGenreError(true); setGenreLoading(false); }); }} style={{ display: 'block', margin: '8px auto 0', padding: '6px 16px', borderRadius: 4, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>↻ Retry</button>
            </div>
          )}
          {!genreLoading && !genreError && genreBooks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {genreBooks.filter(book => tabLanguage === 'all' || book.language === tabLanguage).map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}
            </div>
          )}
          {!genreLoading && !genreError && genreBooks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text2)', fontSize: 11 }}>No books found for {selectedGenre}.</div>
          )}
        </div>
      )}

      {/* FOR YOU TAB */}
      {activeTab === 'foryou' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {preferences && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ key: 'all', label: 'All for you' }, { key: 'genre', label: preferences.topGenres[0]?.genre || 'By genre' }, { key: 'author', label: preferences.topAuthors[0]?.author?.split(' ').pop() || 'By author' }].map(tab => (
                <button key={tab.key} onClick={() => setActiveFilter(tab.key as FilterMode)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 4, border: '1px solid', background: activeFilter === tab.key ? 'rgba(201,168,76,0.12)' : 'transparent', borderColor: activeFilter === tab.key ? 'var(--gold)' : 'var(--card-border)', color: activeFilter === tab.key ? 'var(--gold)' : 'var(--text2)', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', transition: 'all 0.15s' }}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {!searchQuery && activeFilter === 'all' && filteredSections.map((section) => <RecommendationSection key={section.title} section={section} {...cardProps} />)}
          {activeFilter === 'genre' && preferences && <GenreSection genre={preferences.topGenres[0]?.genre} {...cardProps} />}
          {activeFilter === 'author' && preferences && preferences.topAuthors[0] && <AuthorSection author={preferences.topAuthors[0].author} {...cardProps} />}
          {!preferences && <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text2)', fontSize: 12 }}>Not enough data yet. Rate a few books to get personalized recommendations!</div>}
        </div>
      )}
    </div>
  );
}

// ── Discovery card ───────────────────────────────────────────

type CardProps = {
  libraryBooks: Book[];
  onAdd: (book: Recommendation) => void;
  onQuickAdd: (book: Partial<Book>) => Promise<void>;
};

function formatCount(n: number | undefined): string {
  if (!n) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function DiscoveryCard({ book, libraryBooks, onAdd, onQuickAdd }: CardProps & { book: Recommendation }) {
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const normalize = (value: string) => value.trim().toLowerCase();
  const inLibrary = added || libraryBooks.some(existing =>
    (book.key && existing.openlibrary_key === book.key) ||
    (normalize(existing.title) === normalize(book.title) && normalize(existing.author || '') === normalize(book.author || '')),
  );

  async function quickAdd() {
    if (pending.current || inLibrary) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    let details: { genre: string | null; description: string | null } = { genre: null, description: null };
    try { details = await fetchWorkDetails(book.key); } catch { /* add using search data */ }
    try {
      await onQuickAdd({ title: book.title, author: book.author, pages: book.pages, cover_url: book.coverUrl,
        genre: details.genre || book.genre, description: details.description || book.description,
        language: book.language, openlibrary_key: book.key, status: 'planned' });
      setAdded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add book');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <>
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }} onClick={() => setShowDetail(true)}>
      <div style={{ position: 'relative' }}>
        <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'var(--bg2)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
          {book.coverUrl && <img src={book.coverUrl} alt={book.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { const el = e.currentTarget; el.style.display = 'none'; const fallback = el.nextElementSibling as HTMLElement; if (fallback) fallback.style.display = 'flex'; }} />}
          <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: book.coverUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📖</div>
        </div>
        {'readinglogCount' in book && book.readinglogCount && <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--bg2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: 'var(--gold)' }}>👥 {formatCount(book.readinglogCount)}</div>}
        <button type="button" onClick={e => { e.stopPropagation(); void quickAdd(); }} disabled={saving || inLibrary}
          style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, background: 'rgba(7,9,15,0.8)', border: 'none', borderRadius: '0 6px 0 6px', cursor: inLibrary ? 'default' : 'pointer', fontSize: 18, lineHeight: 1 }}
          aria-label={inLibrary ? `${book.title} already in library` : `Add ${book.title} to library`} aria-pressed={inLibrary}>{inLibrary ? '❤️' : '🤍'}</button>
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</div>
        {book.rating && <div style={{ fontSize: 11, color: 'var(--gold)' }}>{'★'.repeat(Math.round(book.rating))} {book.rating.toFixed(1)}</div>}
      </div>
      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>}
    </div>
    {showDetail && <ModalPortal><div className="modal-overlay" onClick={() => setShowDetail(false)}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 14, padding: 20 }}>
          {book.coverUrl ? <img src={book.coverUrl} alt={book.title} style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} /> : <div style={{ width: 80, height: 120, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📖</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{book.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{book.author}</div>
            {book.rating && <div style={{ fontSize: 11, color: 'var(--gold)' }}>{'★'.repeat(Math.round(book.rating))} {book.rating.toFixed(1)} / 5</div>}
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{book.pages && `${book.pages}p`} {book.year && `· ${book.year}`} {book.genre && `· ${book.genre}`}</div>
          </div>
        </div>
        {book.description && <div style={{ padding: '0 20px 16px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>{book.description.slice(0, 400)}</div>}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 8 }}>
          <button type="button" className="btn-gold" style={{ flex: 1, minHeight: 44 }} onClick={() => { onAdd(book); setShowDetail(false); }}>+ Add to Library</button>
          <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={() => setShowDetail(false)}>Close</button>
        </div>
      </div>
    </div></ModalPortal>}
  </>;
}

function RecommendationSection({ section, ...cardProps }: { section: { title: string; books: Recommendation[]; loading: boolean } } & CardProps) {
  if (section.loading) return <div><SectionHeader title={section.title} /><div style={{ height: 200, background: 'var(--bg2)', borderRadius: 6 }} /></div>;
  if (!section.books.length) return null;
  return <div><SectionHeader title={section.title} count={section.books.length} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{section.books.map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}</div></div>;
}

function GenreSection({ genre, ...cardProps }: { genre: string | undefined } & CardProps) {
  const [books, setBooks] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!genre) return; setLoading(true); olSearchByGenre(genre, undefined, undefined, 8).then(data => { setBooks(data || []); setLoading(false); }).catch(() => setLoading(false)); }, [genre]);
  if (loading) return <div style={{ height: 200, background: 'var(--bg2)', borderRadius: 6 }} />;
  return books.length ? <div><SectionHeader title={`${genre} — highly rated`} count={books.length} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{books.map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}</div></div> : null;
}

function AuthorSection({ author, ...cardProps }: { author: string } & CardProps) {
  const [books, setBooks] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { olSearchByAuthor(author).then(data => { setBooks(data || []); setLoading(false); }).catch(() => setLoading(false)); }, [author]);
  if (loading) return <div style={{ height: 200, background: 'var(--bg2)', borderRadius: 6 }} />;
  return books.length ? <div><SectionHeader title={`More by ${author}`} count={books.length} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{books.map(book => <DiscoveryCard key={book.key} book={book} {...cardProps} />)}</div></div> : null;
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{title}</span>{count !== undefined && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{count} books</span>}</div>;
}
