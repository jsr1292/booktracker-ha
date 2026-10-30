import { useState, useMemo, useCallback } from 'react';
import type { Book } from '../types';
import SwipeableCard from './SwipeableCard';
import { haptics } from '../lib/haptics';
import { updateBook } from '../lib/db';
import { swipeRightAction } from '../lib/utils';

type StatusFilter = 'all' | Book['status'];
type SortKey = 'recent' | 'oldest' | 'title' | 'author' | 'rating' | 'pages';

export interface BookListProps {
  books: Book[];
  onDelete: (id: number) => void;
  onOpenDetail: (book: Book) => void;
  onRefresh?: () => Promise<void>;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_STYLE: Record<Book['status'], { label: string; color: string }> = {
  reading: { label: 'Reading', color: 'var(--green)' },
  planned: { label: 'Planned', color: 'var(--blue)' },
  finished: { label: 'Finished', color: 'var(--gold)' },
  abandoned: { label: 'Abandoned', color: 'var(--red)' },
};

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'planned', label: 'Planned' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'rating', label: 'Rating' },
  { key: 'pages', label: 'Longest' },
];

/** Lowercase and strip accents, so "garcia" finds "García". */
function normalize(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 44,
  background: 'var(--bg2)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
  padding: '0 8px',
  color: 'var(--text)',
  fontFamily: "'JetBrains Mono', monospace",
};

const filterLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text2)',
  marginBottom: 4,
};

export default function BookList({ books, onDelete, onOpenDetail, onRefresh }: BookListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [authorFilter, setAuthorFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');

  const allAuthors = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.author) set.add(b.author); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => { if (b.genre) set.add(b.genre); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: books.length, reading: 0, planned: 0, finished: 0, abandoned: 0 };
    books.forEach(b => { counts[b.status]++; });
    return counts;
  }, [books]);

  const narrowing = !!(search.trim() || authorFilter || genreFilter);

  const matches = useMemo(() => {
    const term = normalize(search.trim());
    const list = books.filter(b => {
      if (status !== 'all' && b.status !== status) return false;
      if (authorFilter && b.author !== authorFilter) return false;
      if (genreFilter && b.genre !== genreFilter) return false;
      return !term || normalize(b.title).includes(term) || normalize(b.author).includes(term);
    });
    const dateOf = (b: Book) => b.date_finished || b.date_started || '';
    return list.sort((a, b) => {
      switch (sortKey) {
        case 'oldest': return dateOf(a).localeCompare(dateOf(b));
        case 'title': return a.title.localeCompare(b.title);
        case 'author': return (a.author ?? '').localeCompare(b.author ?? '');
        case 'rating': return (b.rating ?? 0) - (a.rating ?? 0);
        case 'pages': return (b.pages ?? 0) - (a.pages ?? 0);
        default: return dateOf(b).localeCompare(dateOf(a));
      }
    });
  }, [books, status, search, authorFilter, genreFilter, sortKey]);

  // Unfiltered, reading and planned books are pinned above the main list.
  const showPinned = status === 'all' && !narrowing;
  const reading = showPinned ? matches.filter(b => b.status === 'reading') : [];
  const planned = showPinned ? matches.filter(b => b.status === 'planned') : [];
  const rest = showPinned ? matches.filter(b => b.status !== 'reading' && b.status !== 'planned') : matches;

  const handleStatusToggle = useCallback(async (book: Book) => {
    if (!book.id) return;
    const newStatus = swipeRightAction(book.status).status;
    haptics.statusChange();
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'finished') {
      // Marking finished — auto-set date_finished to today
      if (!book.date_finished) updates.date_finished = new Date().toISOString().split('T')[0];
    } else if (newStatus === 'reading') {
      updates.date_finished = null;
      if (!book.date_started) updates.date_started = new Date().toISOString().split('T')[0];
    }
    await updateBook(book.id, updates);
    await onRefresh?.();
  }, [onRefresh]);

  const clearFilters = () => { setSearch(''); setAuthorFilter(''); setGenreFilter(''); setStatus('all'); };

  const row = (book: Book) => (
    <SwipeableCard
      key={book.id}
      onSwipeLeft={() => book.id != null && onDelete(book.id)}
      onSwipeRight={() => handleStatusToggle(book)}
      leftLabel="Delete"
      rightLabel={swipeRightAction(book.status).label}
    >
      <BookRow book={book} onOpen={() => onOpenDetail(book)} />
    </SwipeableCard>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: 'var(--text)' }}>Library</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
          {matches.length === books.length ? `${books.length} total` : `${matches.length} of ${books.length}`}
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search title or author"
        enterKeyHint="search"
        autoComplete="off"
        style={{ ...selectStyle, padding: '0 12px' }}
      />

      {/* Status */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -12px', padding: '0 12px' }}>
        {STATUS_TABS.map(tab => {
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              aria-pressed={active}
              style={{
                flexShrink: 0, minHeight: 44, padding: '0 12px', borderRadius: 6, border: '1px solid',
                borderColor: active ? 'var(--gold)' : 'var(--card-border)',
                background: active ? 'var(--gold-bg-hover)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--text2)',
                fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}
            >
              {tab.label} {statusCounts[tab.key]}
            </button>
          );
        })}
      </div>

      {/* Sort and filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <label>
          <span style={filterLabelStyle}>Sort</span>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={selectStyle}>
            {SORT_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
        </label>
        <label>
          <span style={filterLabelStyle}>Author</span>
          <select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>
          <span style={filterLabelStyle}>Genre</span>
          <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>

      {/* Empty state */}
      {matches.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📚</div>
          {books.length > 0 ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>No books match</p>
              <button onClick={clearFilters} className="btn-ghost" style={{ minHeight: 44 }}>Clear search and filters</button>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>No books yet. Tap + to add your first.</p>
          )}
        </div>
      )}

      {reading.length > 0 && <Section title="Currently reading" count={reading.length} color="var(--green)">{reading.map(row)}</Section>}
      {planned.length > 0 && <Section title="Planned" count={planned.length} color="var(--blue)">{planned.map(row)}</Section>}
      {showPinned && rest.length > 0 && (reading.length > 0 || planned.length > 0)
        ? <Section title="Other books" count={rest.length} color="var(--text2)">{rest.map(row)}</Section>
        : rest.map(row)}
    </div>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'sticky', top: 'var(--header-h)', zIndex: 10, background: 'var(--bg)', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color }}>
        {title} ({count})
      </div>
      {children}
    </section>
  );
}

function BookRow({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const statusStyle = STATUS_STYLE[book.status] ?? STATUS_STYLE.finished;
  const date = book.status === 'finished' ? book.date_finished : book.date_started;
  return (
    <div className="book-card" style={{ cursor: 'pointer', display: 'flex', gap: 12 }} onClick={onOpen}>
      {book.cover_url && !coverFailed ? (
        <img
          src={book.cover_url}
          alt=""
          loading="lazy"
          style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'var(--border)' }}
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div style={{ width: 48, height: 72, background: 'var(--border)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📖</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
          {book.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</div>
        {book.status === 'reading' && book.current_page != null && <>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>p. {book.current_page}{book.pages ? ` / ${book.pages}` : ''}</div>
          {book.pages && <div role="progressbar" aria-valuenow={book.current_page} aria-valuemax={book.pages} style={{ height: 3, marginTop: 3, background: 'var(--border-strong)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, book.current_page / book.pages * 100)}%`, background: 'var(--gold)' }} /></div>}
        </>}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
          <span style={{ color: statusStyle.color }}>{statusStyle.label}</span>
          {book.rating ? <span className="stars" aria-label={`${book.rating} out of 5`}>{'★'.repeat(book.rating)}</span> : null}
          {date ? <span>{formatDate(date)}</span> : null}
          {book.pages ? <span>{book.pages}p</span> : null}
          {book.genre ? <span>{book.genre}</span> : null}
        </div>
      </div>
    </div>
  );
}
