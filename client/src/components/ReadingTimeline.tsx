import type { Book } from '../types';

interface Props { books: Book[]; }

function formatMonth(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByMonth(books: Book[]): Map<string, Book[]> {
  const map = new Map<string, Book[]>();
  for (const b of books) {
    if (!b.date_finished) continue;
    const k = b.date_finished.substring(0, 7);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(b);
  }
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

function getUndated(books: Book[]): Book[] {
  return books.filter(b => !b.date_finished);
}

export default function ReadingTimeline({ books }: Props) {
  const grouped = groupByMonth(books);
  const undated = getUndated(books);

  if (!books.length) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>No reading history yet</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 15, color: 'var(--text)' }}>Reading Timeline</div>
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{books.length} books across {grouped.size} months</div>
      </div>

      {/* Undated section */}
      {undated.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="timeline-dot" style={{ background: 'var(--text3)' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Undated
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ fontSize: 10, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
              {undated.length}
            </span>
          </div>
          <div style={{ marginLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {undated.map((book) => (
              <div key={book.id} className="book-card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>📖</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{book.author}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {book.rating ? (
                      <span className="stars" style={{ fontSize: 11 }}>{'★'.repeat(book.rating)}</span>
                    ) : null}
                    {book.pages && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{book.pages}p</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {[...grouped.entries()].map(([month, monthBooks], idx) => (
        <div key={month}>
          {/* Month header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className={`timeline-dot ${idx === 0 ? 'active' : ''}`} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {formatMonth(monthBooks[0].date_finished ?? '')}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ fontSize: 10, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
              {monthBooks.length}
            </span>
          </div>

          {/* Books */}
          <div style={{ marginLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {monthBooks.map((book) => (
              <div key={book.id} className="book-card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>📖</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{book.author}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {book.rating ? (
                      <span className="stars" style={{ fontSize: 11 }}>{'★'.repeat(book.rating)}</span>
                    ) : null}
                    {book.pages && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{book.pages}p</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
