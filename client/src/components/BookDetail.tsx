import { useState, useEffect } from 'react';
import type { Book } from '../types';
import { fetchAuthorWorks, fetchWorkRatings, getCoverUrl, type OLWork } from '../lib/openLibrary';

interface Props {
  book: Book;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  openLibraryKey?: string; // e.g. "/works/OL45804W"
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

export default function BookDetail({ book, onEdit, onDelete, onClose, openLibraryKey, onAddBook }: Props) {
  const badge = book.status === 'reading' ? { cls: 'badge-green', text: 'Reading', emoji: '📖' }
    : book.status === 'abandoned' ? { cls: 'badge-red', text: 'Abandoned', emoji: '❌' }
    : { cls: 'badge-gold', text: 'Finished', emoji: '✅' };

  // OL ratings
  const [olRatings, setOlRatings] = useState<{ average: number | null; count: number | null } | null>(null);
  // More by author
  const [authorWorks, setAuthorWorks] = useState<OLWork[]>([]);
  const [authorWorksLoading, setAuthorWorksLoading] = useState(false);

  // Fetch OL ratings if we have a work key
  useEffect(() => {
    if (!openLibraryKey) return;
    fetchWorkRatings(openLibraryKey)
      .then(r => setOlRatings({ average: r.average, count: r.count }))
      .catch(() => { /* ratings optional */ });
  }, [openLibraryKey]);

  // Fetch author works if we have an author name
  useEffect(() => {
    if (!book.author) return;
    setAuthorWorksLoading(true);
    // Try to extract author OL key from cover URL or just use name search
    // For simplicity, we search by author name
    fetchAuthorWorks(book.author!, openLibraryKey, 10)
      .then(works => { setAuthorWorks(works); setAuthorWorksLoading(false); })
      .catch(() => { setAuthorWorksLoading(false); });
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: '#d4dce8' }}>Book Details</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8096b4', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px' }}>

          {/* Cover + title block */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {book.cover_url ? (
              <img
                src={book.cover_url}
                alt={book.title}
                style={{ width: 100, height: 150, objectFit: 'cover', borderRadius: 6, flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              />
            ) : (
              <div style={{ width: 100, height: 150, background: 'rgba(255,255,255,0.04)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>📖</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: '#d4dce8', marginBottom: 6, lineHeight: 1.3 }}>{book.title}</h2>
              <div style={{ fontSize: 12, color: '#8096b4', marginBottom: 10 }}>{book.author}</div>

              {/* Rating (user's) */}
              {book.rating && (
                <div style={{ fontSize: 16, color: '#c9a84c', marginBottom: 8 }} className="stars">
                  {renderStars(book.rating)}
                </div>
              )}

              {/* Open Library ratings */}
              {olRatings && olRatings.average && (
                <div style={{ fontSize: 11, color: '#c9a84c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>★ {olRatings.average.toFixed(1)}</span>
                  {olRatings.count && <span style={{ color: '#8096b4', fontSize: 10 }}>({olRatings.count.toLocaleString()} ratings)</span>}
                  <span style={{ fontSize: 9, color: '#6a7a8a', marginLeft: 4 }}>Open Library</span>
                </div>
              )}

              {/* Status badge */}
              <span className={`badge ${badge.cls}`}>{badge.emoji} {badge.text}</span>
            </div>
          </div>

          {/* Metadata grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {book.pages && <MetaItem label="Pages" value={`${book.pages}`} />}
            {book.genre && <MetaItem label="Genre" value={book.genre} />}
            {book.language && <MetaItem label="Language" value={book.language} />}
            {book.date_started && <MetaItem label="Started" value={formatDate(book.date_started)} />}
            <MetaItem label="Finished" value={formatDate(book.date_finished ?? '')} />
            {book.rating && <MetaItem label="Rating" value={`${book.rating}/5`} />}
          </div>

          {/* Description */}
          {book.description && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                Description
              </div>
              <div style={{ fontSize: 12, color: '#b0c0d8', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                {book.description.length > 500 ? book.description.slice(0, 500) + '...' : book.description}
              </div>
            </div>
          )}

          {/* Notes */}
          {book.notes && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                Notes
              </div>
              <div style={{ fontSize: 12, color: '#b0c0d8', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                {book.notes}
              </div>
            </div>
          )}

          {/* More by this author */}
          {(authorWorksLoading || authorWorks.length > 0) && book.author && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10, fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 6 }}>
                More by <span style={{ color: '#c9a84c' }}>{book.author}</span>
              </div>
              {authorWorksLoading ? (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ width: 80, height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: 6, flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
                  {authorWorks.map(work => (
                    <AuthorWorkCard
                      key={work.key}
                      work={work}
                      onAdd={() => handleAddWork(work)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
          <button
            onClick={onEdit}
            style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.15s' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.2)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.1)'; }}
          >
            ✎ Edit
          </button>
          <button
            onClick={() => { if (window.confirm('Delete this book? This cannot be undone.')) onDelete(); }}
            style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'rgba(255,77,106,0.15)', border: '1px solid rgba(255,77,106,0.4)', color: '#ff4d6a', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.15s' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,106,0.25)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,106,0.15)'; }}
          >
            ✕ Delete
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function AuthorWorkCard({ work, onAdd }: { work: OLWork; onAdd: () => void }) {
  const [showTip, setShowTip] = useState(false);
  const coverUrl = work.coverId ? getCoverUrl(work.coverId, 'S') : null;

  return (
    <div
      style={{ width: 80, flexShrink: 0, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
      onClick={() => setShowTip(true)}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{ width: '100%', height: 110, background: 'rgba(255,255,255,0.04)', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
        {coverUrl ? (
          <img src={coverUrl} alt={work.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement; if (fb) fb.style.display = 'flex'; }} />
        ) : null}
        <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: coverUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📖</div>
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
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 12, color: '#d4dce8' }}>{value}</div>
    </div>
  );
}
