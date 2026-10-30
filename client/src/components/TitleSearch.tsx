import { useState, useRef, useEffect } from 'react';
import { searchBooks, type BookResult } from '../api/bookLookup';

export { type BookResult };

export function useBookSearch() {
  const [suggestions, setSuggestions] = useState<BookResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);

  const search = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const sequence = ++sequenceRef.current;
    setSuggestions([]);
    setError(false);
    setSearched(false);
    if (query.trim().length < 3) { setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchBooks(query);
        if (sequence === sequenceRef.current) { setSuggestions(results); setSearched(true); }
      } catch {
        if (sequence === sequenceRef.current) { setError(true); setSearched(true); }
      } finally {
        if (sequence === sequenceRef.current) setSearching(false);
      }
    }, 300);
  };

  useEffect(() => () => { sequenceRef.current++; if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return { suggestions, searching, error, searched, search };
}

interface TitleSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (book: BookResult) => void;
  suggestions: BookResult[];
  searching: boolean;
  error: boolean;
  searched: boolean;
  onSearch: (q: string) => void;
}

export function TitleSearch({ value, onChange, onSelect, suggestions, searching, error, searched, onSearch }: TitleSearchProps) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); onSearch(e.target.value); }}
        placeholder={isOnline ? "Start typing a book title..." : "No internet — enter book details manually"}
        style={{
          width: '100%',
          background: 'var(--bg3)',
          border: '1px solid var(--card-border)',
          borderRadius: 6,
          padding: '10px 14px',
          color: isOnline ? 'var(--text)' : 'var(--text3)',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s' }}
        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = isOnline ? 'var(--gold)' : 'var(--card-border)'; }}
        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--card-border)'; }}
        autoComplete="off"
        readOnly={!isOnline}
      />

      {/* Offline indicator */}
      {!isOnline && (
        <div style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, color: 'var(--text2)', pointerEvents: 'none' }}>
          📡 offline
        </div>
      )}

      {/* Suggestions dropdown */}
      {!searching && (suggestions.length > 0 || searched) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--bg2)', border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 6, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)',
          maxHeight: 320, overflowY: 'auto' }}>
          {suggestions.length === 0 && <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text2)' }}>{error ? "Couldn't reach Open Library. You can enter the details yourself." : 'No matches. You can enter the details yourself.'}</div>}
          {suggestions.map((book, idx) => (
            <div
              key={idx}
              onMouseDown={() => onSelect(book)}
              style={{
                display: 'flex', gap: 10, padding: '10px 14px', cursor: 'pointer',
                borderBottom: idx < suggestions.length - 1 ? '1px solid var(--card-border)' : 'none',
                transition: 'background 0.1s' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ position: 'relative', width: 32, height: 48, flexShrink: 0, borderRadius: 3, overflow: 'hidden', background: 'var(--border)' }}>
                {book.coverUrl && (
                  <img
                    src={book.coverUrl}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    loading="lazy"
                  />
                )}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📖</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</div>
                {book.pages && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{book.pages}p{book.genre ? ` · ${book.genre}` : ''}</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gold)', alignSelf: 'center', flexShrink: 0 }}>Select →</div>
            </div>
          ))}
        </div>
      )}

      {searching && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--bg2)', border: '1px solid var(--card-border)',
          borderRadius: 6, marginTop: 4, padding: '10px 14px',
          fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          Searching Open Library...
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
