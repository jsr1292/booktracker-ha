import React, { useEffect, useState } from 'react';
import type { Book } from '../types';
import { fetchAuthorWorks, fetchWorkRatings, getCoverUrl, resolveAuthorKey, type OLWork } from '../lib/openLibrary';
import { haptics } from '../lib/haptics';

interface Props {
  book: Book;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  openLibraryKey?: string;
  onAddBook?: (data: Partial<Book>) => void;
}

function renderStars(rating: number | null): string {
  if (!rating) return '—';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function BookDetailSheet({ book, onEdit, onDelete, onClose, openLibraryKey, onAddBook }: Props) {
  const badge = book.status === 'reading' ? { cls: 'badge-green', text: 'Reading', emoji: '📖' }
    : book.status === 'planned' ? { cls: 'badge-blue', text: 'Planned', emoji: '📋' }
    : book.status === 'abandoned' ? { cls: 'badge-red', text: 'Abandoned', emoji: '❌' }
    : { cls: 'badge-gold', text: 'Finished', emoji: '✅' };

  const [olRatings, setOlRatings] = useState<{ average: number | null; count: number | null } | null>(null);
  const [authorWorks, setAuthorWorks] = useState<OLWork[]>([]);
  const [authorWorksLoading, setAuthorWorksLoading] = useState(false);

  useEffect(() => {
    if (!openLibraryKey) return;
    fetchWorkRatings(openLibraryKey)
      .then(r => setOlRatings({ average: r.average, count: r.count }))
      .catch(() => {});
  }, [openLibraryKey]);

  useEffect(() => {
    if (!book.author) return;
    let cancelled = false;
    setAuthorWorksLoading(true);
    resolveAuthorKey(book.author)
      .then(authorKey => {
        if (!authorKey || cancelled) { setAuthorWorksLoading(false); return; }
        return fetchAuthorWorks(authorKey, openLibraryKey, 10);
      })
      .then(works => { if (works && !cancelled) { setAuthorWorks(works); setAuthorWorksLoading(false); } })
      .catch(() => { if (!cancelled) setAuthorWorksLoading(false); });
    return () => { cancelled = true; };
  }, [book.author, openLibraryKey]);

  function handleAddWork(work: OLWork) {
    if (!onAddBook) return;
    onAddBook({
      title: work.title,
      author: book.author ?? undefined,
      cover_url: work.coverId ? getCoverUrl(work.coverId, 'M') ?? undefined : undefined,
      description: work.description ?? undefined,
      status: 'planned',
    });
  }

  const handleDelete = () => {
    onDelete(); // handleDeleteBook in App.tsx shows confirm dialog
  };

  return (
    <div style={{ padding: '8px 20px 24px' }}>
      {/* Cover + title block */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 6, flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
          />
        ) : (
          <div style={{ width: 80, height: 120, background: 'rgba(255,255,255,0.04)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>📖</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 15, color: '#d4dce8', marginBottom: 6, lineHeight: 1.3 }}>{book.title}</h2>
          <div style={{ fontSize: 12, color: '#8096b4', marginBottom: 8 }}>{book.author}</div>
          {book.rating && (
            <div style={{ fontSize: 14, color: '#c9a84c', marginBottom: 6 }} className="stars">
              {renderStars(book.rating)}
            </div>
          )}
          {olRatings && olRatings.average && (
            <div style={{ fontSize: 11, color: '#c9a84c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>★ {olRatings.average.toFixed(1)}</span>
              {olRatings.count && <span style={{ color: '#8096b4', fontSize: 10 }}>({olRatings.count.toLocaleString()} ratings)</span>}
            </div>
          )}
          <span className={`badge ${badge.cls}`}>{badge.emoji} {badge.text}</span>
        </div>
      </div>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {book.pages && <MetaItem label="Pages" value={`${book.pages}`} />}
        {book.genre && <MetaItem label="Genre" value={book.genre} />}
        {book.language && <MetaItem label="Language" value={book.language} />}
        {book.date_started && <MetaItem label="Started" value={formatDate(book.date_started)} />}
        <MetaItem label="Finished" value={formatDate(book.date_finished ?? '')} />
        {book.rating && <MetaItem label="Rating" value={`${book.rating}/5`} />}
      </div>

      {/* Description */}
      {book.description && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>Description</div>
          <div style={{ fontSize: 12, color: '#b0c0d8', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
            {book.description.length > 400 ? book.description.slice(0, 400) + '...' : book.description}
          </div>
        </div>
      )}

      {/* Notes */}
      {book.notes && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>Notes</div>
          <div style={{ fontSize: 12, color: '#b0c0d8', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
            {book.notes}
          </div>
        </div>
      )}

      {/* More by this author */}
      {(authorWorksLoading || authorWorks.length > 0) && book.author && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6 }}>
            More by <span style={{ color: '#c9a84c' }}>{book.author}</span>
          </div>
          {authorWorksLoading ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
              {[1,2,3,4].map(i => <div key={i} style={{ width: 70, height: 100, background: 'rgba(255,255,255,0.03)', borderRadius: 6, flexShrink: 0 }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
              {authorWorks.map(work => (
                <AuthorWorkCard key={work.key} work={work} onAdd={() => handleAddWork(work)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.15s' }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.2)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.1)')}
        >
          ✎ Edit
        </button>
        <button
          onClick={handleDelete}
          style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'rgba(255,77,106,0.15)', border: '1px solid rgba(255,77,106,0.4)', color: '#ff4d6a', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.15s' }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,77,106,0.25)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,77,106,0.15)')}
        >
          ✕ Delete
        </button>
      </div>
    </div>
  );
}

function AuthorWorkCard({ work, onAdd }: { work: OLWork; onAdd: () => void }) {
  const [showTip, setShowTip] = useState(false);
  const coverUrl = work.coverId ? getCoverUrl(work.coverId, 'S') : null;

  return (
    <div
      style={{ width: 70, flexShrink: 0, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
      onClick={() => setShowTip(true)}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{ width: '100%', height: 95, background: 'rgba(255,255,255,0.04)', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
        {coverUrl ? (
          <img src={coverUrl} alt={work.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📖</div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onAdd(); }}
          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(7,9,15,0.85)', border: 'none', borderRadius: 3, padding: '2px 4px', cursor: 'pointer', fontSize: 10, lineHeight: 1 }}
        >+</button>
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: 8, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{work.title}</div>
        {work.year && <div style={{ fontSize: 7, color: '#6a7a8a', marginTop: 2 }}>{work.year}</div>}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 8, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 3, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 12, color: '#d4dce8' }}>{value}</div>
    </div>
  );
}
