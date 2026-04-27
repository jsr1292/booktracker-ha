import type { Book } from '../types';

interface Props {
  book: Book;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
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

export default function BookDetail({ book, onEdit, onDelete, onClose }: Props) {
  const badge = book.status === 'reading' ? { cls: 'badge-green', text: 'Reading', emoji: '📖' }
    : book.status === 'abandoned' ? { cls: 'badge-red', text: 'Abandoned', emoji: '❌' }
    : { cls: 'badge-gold', text: 'Finished', emoji: '✅' };

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

              {/* Rating */}
              {book.rating && (
                <div style={{ fontSize: 16, color: '#c9a84c', marginBottom: 8 }} className="stars">
                  {renderStars(book.rating)}
                </div>
              )}

              {/* Status badge */}
              <span className={`badge ${badge.cls}`}>{badge.emoji} {badge.text}</span>
            </div>
          </div>

          {/* Metadata grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {book.pages && (
              <MetaItem label="Pages" value={`${book.pages}`} />
            )}
            {book.genre && (
              <MetaItem label="Genre" value={book.genre} />
            )}
            {book.language && (
              <MetaItem label="Language" value={book.language} />
            )}
            {book.date_started && (
              <MetaItem label="Started" value={formatDate(book.date_started)} />
            )}
            <MetaItem label="Finished" value={formatDate(book.date_finished ?? '')} />
            {book.rating && (
              <MetaItem label="Rating" value={`${book.rating}/5`} />
            )}
            {book.notes && (
              <MetaItem label="Notes" value={book.notes.length > 80 ? book.notes.slice(0, 80) + '...' : book.notes} />
            )}
          </div>

          {/* Description */}
          {book.description && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                Description
              </div>
              <div style={{ fontSize: 12, color: '#b0c0d8', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                {book.description.length > 500
                  ? book.description.slice(0, 500) + '...'
                  : book.description}
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
