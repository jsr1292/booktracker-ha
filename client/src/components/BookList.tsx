import { useState, useMemo } from 'react';
import type { Book } from '../types';
import SwipeableCard from './SwipeableCard';
import ProgressRing from './ProgressRing';
import { haptics } from '../lib/haptics';
import { updateBook } from '../lib/db';

export type SortKey = 'date_finished' | 'title' | 'author' | 'rating' | 'pages';

export interface BookListProps {
  books: Book[];
  onEdit: (book: Book) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
  onOpenDetail: (book: Book) => void;
  onRefresh?: () => Promise<void>;
  statusFilter?: 'all' | 'reading' | 'finished' | 'abandoned' | 'planned';
}

function renderStars(rating: number | null): string {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'reading': return { cls: 'badge-green', text: 'Reading', emoji: '📖' };
    case 'finished': return { cls: 'badge-gold', text: 'Finished', emoji: '✅' };
    case 'abandoned': return { cls: 'badge-red', text: 'Abandoned', emoji: '❌' };
    case 'planned': return { cls: 'badge-blue', text: 'Planned', emoji: '📋' };
    default: return { cls: 'badge-gold', text: 'Finished', emoji: '✅' };
  }
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_finished', label: 'Date' },
  { key: 'rating', label: 'Rating' },
  { key: 'title', label: 'Title' },
  { key: 'pages', label: 'Pages' },
];

function getReadingProgress(book: Book): number {
  if (!book.date_started) return 0;
  const start = new Date(book.date_started + 'T00:00:00');
  const now = new Date();
  const days = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.min(0.9, days / 30);
}

export default function BookList({
  books,
  onEdit,
  onDelete,
  onAdd,
  onOpenDetail,
  onRefresh,
  statusFilter = 'all',
}: BookListProps) {
  const [, forceUpdate] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('date_finished');
  const [sortDesc, setSortDesc] = useState(true);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);

  // Unique authors and genres for filter chips
  const allAuthors = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.author) set.add(b.author); });
    return [...set].sort();
  }, [books]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.genre) set.add(b.genre); });
    return [...set].sort();
  }, [books]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? books : books.filter(b => b.status === statusFilter);
    if (authorFilter) list = list.filter(b => b.author === authorFilter);
    if (genreFilter) list = list.filter(b => b.genre === genreFilter);
    return [...list].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (sortKey === 'date_finished') {
        av = a.date_finished || a.date_started || '';
        bv = b.date_finished || b.date_started || '';
      } else if (sortKey === 'title') {
        av = a.title.toLowerCase(); bv = b.title.toLowerCase();
      } else if (sortKey === 'author') {
        av = (a.author ?? '').toLowerCase(); bv = (b.author ?? '').toLowerCase();
      } else if (sortKey === 'rating') {
        av = a.rating ?? 0; bv = b.rating ?? 0;
      } else if (sortKey === 'pages') {
        av = a.pages ?? 0; bv = b.pages ?? 0;
      }
      if (av < bv) return sortDesc ? 1 : -1;
      if (av > bv) return sortDesc ? -1 : 1;
      return 0;
    });
  }, [books, statusFilter, authorFilter, genreFilter, sortKey, sortDesc]);

  const handleStatusToggle = useMemo(() => async (book: Book) => {
    if (!book.id) return;
    const newStatus = book.status === 'finished' ? 'reading' : 'finished';
    haptics.statusChange();
    await updateBook(book.id, { status: newStatus });
    forceUpdate(n => n + 1);
    await onRefresh?.();
  }, [onRefresh]);

  // Currently reading — always shown at top of the list view
  const currentlyReading = useMemo(() =>
    books.filter(b => b.status === 'reading'), [books]);

  // Planned books — always shown at top of the list view
  const plannedBooks = useMemo(() =>
    books.filter(b => b.status === 'planned'), [books]);

  const activeFilters = authorFilter || genreFilter;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 15, color: '#d4dce8' }}>
            {statusFilter === 'all' ? 'All Books' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
          </div>
          <div style={{ fontSize: 10, color: '#8096b4', marginTop: 2 }}>
            {filtered.length} {activeFilters ? `of ${books.length}` : 'total'}
            {authorFilter && ` · by "${authorFilter.split(' ')[0]}"`}
            {genreFilter && ` · ${genreFilter}`}
          </div>
        </div>
        <button onClick={onAdd} className="btn-gold">+ Add</button>
      </div>

      {/* Sort Controls */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => toggleSort(opt.key)}
            style={{
              fontSize: 9,
              padding: '8px 14px',
              borderRadius: 4,
              border: '1px solid',
              background: sortKey === opt.key ? 'rgba(201,168,76,0.12)' : 'transparent',
              borderColor: sortKey === opt.key ? '#c9a84c' : 'rgba(255,255,255,0.08)',
              color: sortKey === opt.key ? '#c9a84c' : '#8096b4',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {opt.label}
            {sortKey === opt.key && (
              <span style={{ fontSize: 8 }}>{sortDesc ? '↓' : '↑'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Author Filter Chips */}
      {allAuthors.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setAuthorFilter(null)}
            style={{
              fontSize: 8, padding: '8px 14px', borderRadius: 3, border: '1px solid',
              background: !authorFilter ? 'rgba(201,168,76,0.15)' : 'transparent',
              borderColor: !authorFilter ? '#c9a84c' : 'rgba(255,255,255,0.08)',
              color: !authorFilter ? '#c9a84c' : '#8096b4',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >All authors</button>
          {allAuthors.map(a => (
            <button
              key={a}
              onClick={() => setAuthorFilter(authorFilter === a ? null : a)}
              style={{
                fontSize: 8, padding: '8px 14px', borderRadius: 3, border: '1px solid',
                background: authorFilter === a ? 'rgba(201,168,76,0.15)' : 'transparent',
                borderColor: authorFilter === a ? '#c9a84c' : 'rgba(255,255,255,0.08)',
                color: authorFilter === a ? '#c9a84c' : '#8096b4',
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
                transition: 'all 0.15s', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {a.split(' ').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Genre Filter Chips */}
      {allGenres.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setGenreFilter(null)}
            style={{
              fontSize: 8, padding: '8px 14px', borderRadius: 3, border: '1px solid',
              background: !genreFilter ? 'rgba(59,130,246,0.15)' : 'transparent',
              borderColor: !genreFilter ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              color: !genreFilter ? '#3b82f6' : '#8096b4',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >All genres</button>
          {allGenres.map(g => (
            <button
              key={g}
              onClick={() => setGenreFilter(genreFilter === g ? null : g)}
              style={{
                fontSize: 8, padding: '8px 14px', borderRadius: 3, border: '1px solid',
                background: genreFilter === g ? 'rgba(59,130,246,0.15)' : 'transparent',
                borderColor: genreFilter === g ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                color: genreFilter === g ? '#3b82f6' : '#8096b4',
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Active filter clear */}
      {activeFilters && (
        <div style={{ fontSize: 9, color: '#8096b4', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>Filtered</span>
          <button
            onClick={() => { setAuthorFilter(null); setGenreFilter(null); }}
            style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textDecoration: 'underline' }}
          >Clear</button>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📚</div>
          {books.length > 0 && filtered.length === 0 ? (
            <>
              <p style={{ fontSize: 12, color: '#8096b4' }}>No books match your filters</p>
              <p style={{ fontSize: 10, color: '#6a7a8a', marginTop: 4, marginBottom: 16 }}>
                Try clearing the search or filters
              </p>
              <button onClick={() => { setAuthorFilter(null); setGenreFilter(null); }} className="btn-ghost" style={{ display: 'inline-flex', margin: '0 auto' }}>Clear Filters</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#8096b4' }}>No books found</p>
              <p style={{ fontSize: 10, color: '#6a7a8a', marginTop: 4, marginBottom: 16 }}>
                Start by adding your first book
              </p>
              <button onClick={onAdd} className="btn-gold">+ Add Book</button>
            </>
          )}
        </div>
      )}

      {/* Currently Reading Section */}
      {currentlyReading.length > 0 && statusFilter !== 'reading' && !activeFilters && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: '#00e5a0', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
              🔖 Currently Reading ({currentlyReading.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentlyReading.map(book => (
              <SwipeableCard
                key={book.id}
                onSwipeLeft={() => book.id != null && onDelete(book.id)}
                onSwipeRight={() => handleStatusToggle(book)}
                leftLabel="Delete"
                rightLabel="Finished"
              >
                <div
                  className="book-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onOpenDetail(book)}
                >
                  <CurrentlyReadingCard book={book} onEdit={onEdit} />
                </div>
              </SwipeableCard>
            ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '12px 0' }} />
        </div>
      )}

      {/* Planned Books Section */}
      {plannedBooks.length > 0 && statusFilter !== 'planned' && !activeFilters && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
              📋 Planned ({plannedBooks.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plannedBooks.map(book => (
              <SwipeableCard
                key={book.id}
                onSwipeLeft={() => book.id != null && onDelete(book.id)}
                onSwipeRight={() => handleStatusToggle(book)}
                leftLabel="Delete"
                rightLabel="Reading"
              >
                <div
                  className="book-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onOpenDetail(book)}
                >
                  <CurrentlyReadingCard book={book} onEdit={onEdit} />
                </div>
              </SwipeableCard>
            ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '12px 0' }} />
        </div>
      )}

      {/* Book List */}
      {filtered.map((book) => {
        const badge = getStatusBadge(book.status);
        const progress = book.status === 'reading' && book.pages ? getReadingProgress(book) : 0;
        const isFinished = book.status === 'finished';
        return (
          <SwipeableCard
            key={book.id}
            onSwipeLeft={() => book.id != null && onDelete(book.id)}
            onSwipeRight={() => handleStatusToggle(book)}
            leftLabel="Delete"
            rightLabel={isFinished ? 'Reading' : 'Finished'}
          >
            <div
              className="book-card"
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenDetail(book)}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                {/* Cover + progress ring */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title || 'Book cover'}
                      loading="lazy"
                      style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 4 }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                      }}
                    />
                  ) : null}
                  <div style={{
                    width: 48, height: 72, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    ...(book.cover_url ? { display: 'none' } : {}),
                  }}>📖</div>
                  {/* Progress ring for reading books */}
                  {book.status === 'reading' && book.pages && (
                    <div style={{ position: 'absolute', bottom: -6, right: -6 }}>
                      <ProgressRing progress={progress} size={28} strokeWidth={2} />
                    </div>
                  )}
                  {book.status === 'reading' && !book.pages && (
                    <div style={{ position: 'absolute', bottom: -6, right: -6, fontSize: 12 }}>📖</div>
                  )}
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {book.title}
                    </div>
                    <span className={`badge ${badge.cls}`} style={{ fontSize: 7, flexShrink: 0 }}>{badge.text}</span>
                  </div>
                  <div
                    style={{ fontSize: 11, color: '#8096b4', cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setAuthorFilter(book.author?.trim() || null); }}
                    title={`Filter by ${book.author}`}
                  >
                    {book.author}
                  </div>

                  {/* Stars */}
                  {book.rating && (
                    <div style={{ fontSize: 10, color: '#c9a84c', marginTop: 3 }} className="stars">
                      {renderStars(book.rating)}
                    </div>
                  )}

                  {/* Metadata row */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#6a7a8a' }}>
                      {book.status === 'reading' && book.date_started ? formatDate(book.date_started) : formatDate(book.date_finished ?? '')}
                    </span>
                    {book.pages && <span style={{ fontSize: 10, color: '#6a7a8a' }}>· {book.pages}p</span>}
                    {book.genre && (
                      <span
                        style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                        onClick={e => { e.stopPropagation(); setGenreFilter(book.genre?.trim() || null); }}
                      >
                        {book.genre}
                      </span>
                    )}
                  </div>

                  {/* Reading indicator */}
                  {book.status === 'reading' && book.pages && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 9, color: '#00e5a0' }}>📖 Reading</div>
                      <div style={{ fontSize: 9, color: '#6a7a8a', marginTop: 2 }}>
                        Started {book.date_started ? formatDate(book.date_started) : 'recently'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {book.rating ? (
                    <span className="stars" style={{ fontSize: 11 }}>{renderStars(book.rating)}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#6a7a8a' }}>—</span>
                  )}
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onEdit(book)}
                      className="btn-icon"
                    >Edit</button>
                    <button
                      onClick={() => book.id != null && onDelete(book.id)}
                      className="btn-icon-red"
                    >Del</button>
                  </div>
                </div>
              </div>
            </div>
          </SwipeableCard>
        );
      })}
    </div>
  );
}

// ── Currently Reading Card ─────────────────────────────────────────

function CurrentlyReadingCard({ book, onEdit }: { book: Book; onEdit: (b: Book) => void }) {
  const badge = getStatusBadge(book.status);
  const progress = book.status === 'reading' && book.pages ? getReadingProgress(book) : 0;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px' }}>
      {book.cover_url ? (
        <img
          src={book.cover_url}
          alt={book.title || 'Book cover'}
          loading="lazy"
          style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : null}
      <div style={{ width: 36, height: 54, background: 'rgba(255,255,255,0.04)', borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        📖
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
        <div style={{ fontSize: 10, color: '#8096b4', marginTop: 2 }}>{book.author}</div>
        {book.pages && (
          <div style={{ fontSize: 9, color: '#6a7a8a', marginTop: 3 }}>
            {book.status === 'planned' ? '📋 In your list' : `Started ${book.date_started ? new Date(book.date_started + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 3, background: badge.cls === 'badge-blue' ? 'rgba(59,130,246,0.1)' : badge.cls === 'badge-green' ? 'rgba(0,229,160,0.1)' : badge.cls === 'badge-red' ? 'rgba(255,77,106,0.1)' : 'rgba(201,168,76,0.1)', color: badge.cls === 'badge-blue' ? '#3b82f6' : badge.cls === 'badge-green' ? '#00e5a0' : badge.cls === 'badge-red' ? '#ff4d6a' : '#c9a84c', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", display: 'inline-block' }}>
          {badge.text}
        </span>
        {book.status === 'reading' && book.pages && (
          <ProgressRing progress={progress} size={28} strokeWidth={2} />
        )}
      </div>
    </div>
  );
}
