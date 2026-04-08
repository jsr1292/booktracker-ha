import { useState, useEffect } from 'react';
import type { Book } from '../types';
import { TitleSearch, useBookSearch } from './TitleSearch';

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish',
  'Russian', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi',
  'Catalan', 'Basque', 'Galician', 'Other',
];

export interface BookFormData {
  title: string;
  author: string;
  date_finished: string | null;
  pages: number | null;
  rating: number | null;
  genre: string | null;
  language: string | null;
  status: 'reading' | 'finished' | 'abandoned' | 'planned';
  date_started: string | null;
  cover_url: string | null;
  description: string | null;
  notes: string | null;
}

interface Props {
  book?: Book;
  initialData?: Partial<BookFormData>;
  onSave: (data: BookFormData) => void;
  onCancel: () => void;
}

export default function BookForm({ book, initialData, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(book?.title ?? initialData?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? initialData?.author ?? '');
  const [status, setStatus] = useState<'reading' | 'finished' | 'abandoned' | 'planned'>(
    book?.status ?? initialData?.status ?? 'reading'
  );
  const [dateFinished, setDateFinished] = useState(
    book?.date_finished ?? initialData?.date_finished ?? new Date().toISOString().split('T')[0]
  );
  const [dateStarted, setDateStarted] = useState(
    book?.date_started ?? initialData?.date_started ?? ''
  );
  const [pages, setPages] = useState(
    book?.pages?.toString() ?? initialData?.pages?.toString() ?? ''
  );
  const [rating, setRating] = useState<number | ''>(book?.rating ?? initialData?.rating ?? '');
  const [genre, setGenre] = useState(book?.genre ?? initialData?.genre ?? '');
  const [language, setLanguage] = useState(book?.language ?? initialData?.language ?? '');
  const [description, setDescription] = useState(book?.description ?? initialData?.description ?? '');
  const [notes, setNotes] = useState(book?.notes ?? initialData?.notes ?? '');
  const [coverUrl, setCoverUrl] = useState(book?.cover_url ?? initialData?.cover_url ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // When switching to 'reading', auto-fill dateStarted if empty
  useEffect(() => {
    if (status === 'reading' && !dateStarted) {
      setDateStarted(new Date().toISOString().split('T')[0]);
    }
  }, [status]);
  const [autoFilled, setAutoFilled] = useState(false);

  const { suggestions, searching, search } = useBookSearch();

  const handleSelect = (result: { title: string; author: string; pages: number | null; genre: string | null; isbn: string | null; language: string | null; description: string | null; coverUrl?: string | null }) => {
    setTitle(result.title);
    setAuthor(result.author);
    setPages(result.pages?.toString() ?? '');
    setGenre(result.genre ?? '');
    if (result.language) setLanguage(result.language);
    if (result.description) { setDescription(result.description); }
    if (result.coverUrl) { setCoverUrl(result.coverUrl); }
    setAutoFilled(true);
    setErrors(p => ({ ...p, title: '' }));
  };

  // Need to hide suggestions when clicking outside
  const [showSuggestions, setShowSuggestions] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    let valid = true;
    if (!title.trim()) e.title = 'Title is required';
    if (!author.trim()) e.author = 'Author is required';
    if (status === 'finished' && !dateFinished) e.date = 'Date finished is required for finished books';
    if (pages && (isNaN(Number(pages)) || Number(pages) <= 0)) e.pages = 'Must be positive';
    if (rating !== '' && (Number(rating) < 1 || Number(rating) > 5)) e.rating = '1-5 only';
    if (dateStarted && dateFinished && new Date(dateStarted) > new Date(dateFinished)) {
      e.dateStarted = 'Start date must be before finish date';
      valid = false;
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaveError(null);
    setSaving(true);
    try {
      const bookData: BookFormData = {
        title: title.trim(),
        author: author.trim(),
        date_finished: status === 'finished' ? dateFinished : null,
        pages: pages ? Number(pages) : null,
        rating: rating !== '' ? Number(rating) : null,
        genre: genre.trim() || null,
        language: language.trim() || null,
        cover_url: coverUrl.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        status,
        date_started: status === 'reading' ? (dateStarted || new Date().toISOString().split('T')[0]) : null,
      };
      onSave(bookData);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save book');
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 9,
    color: '#8096b4',
    marginBottom: 6,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
  };

  const errorStyle: React.CSSProperties = { fontSize: 10, color: '#ff4d6a', marginTop: 4 };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Auto-fill notice */}
      {autoFilled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', fontSize: 11, color: '#00e5a0' }}>
          ✓ Book info auto-filled from Google Books
        </div>
      )}

      {/* Title with search */}
      <div>
        <label style={labelStyle}>Title *</label>
        <div onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}>
          <TitleSearch
            value={title}
            onChange={val => { setTitle(val); setAutoFilled(false); setErrors(p => ({ ...p, title: '' })); }}
            onSelect={handleSelect}
            suggestions={showSuggestions ? suggestions : []}
            searching={searching}
            onSearch={q => { search(q); setShowSuggestions(true); }}
          />
        </div>
        {!autoFilled && title.length > 0 && title.length < 3 && (
          <div style={{ fontSize: 10, color: '#6a7a8a', marginTop: 4 }}>Keep typing to search...</div>
        )}
        {errors.title && <p style={errorStyle}>{errors.title}</p>}
      </div>

      {/* Author */}
      <div>
        <label style={labelStyle}>Author *</label>
        <input
          value={author}
          onChange={e => setAuthor(e.target.value)}
          placeholder="Author name"
          style={{
            width: '100%',
            background: '#0d1120',
            border: `1px solid ${errors.author ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '10px 14px',
            color: '#d4dce8',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {errors.author && <p style={errorStyle}>{errors.author}</p>}
      </div>

      {/* Status */}
      <div>
        <label style={labelStyle}>Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as 'reading' | 'finished' | 'abandoned')}
          style={{
            width: '100%',
            background: '#0d1120',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '10px 14px',
            color: '#d4dce8',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            boxSizing: 'border-box',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238096b4' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundColor: '#0d1120',
            paddingRight: 32,
          }}
        >
          <option value="reading">📖 Reading</option>
          <option value="planned">📋 Plan to read</option>
          <option value="finished">✅ Finished</option>
          <option value="abandoned">❌ Abandoned</option>
        </select>
      </div>

      {/* Date Started (only for reading) */}
      {status === 'reading' && (
        <div>
          <label style={labelStyle}>Date Started</label>
          <input
            type="date"
            value={dateStarted}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setDateStarted(e.target.value)}
            style={{
              width: '100%',
              background: '#0d1120',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '10px 14px',
              color: '#d4dce8',
              fontSize: 13,
              fontFamily: '"JetBrains Mono", monospace',
              outline: 'none',
              boxSizing: 'border-box',
              colorScheme: 'dark',
            }}
          />
        </div>
      )}

      {/* Date Finished (only for finished) */}
      {status === 'finished' && (
        <div>
          <label style={labelStyle}>Date Finished *</label>
          <input
            type="date"
            value={dateFinished}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setDateFinished(e.target.value)}
            style={{
              width: '100%',
              background: '#0d1120',
              border: `1px solid ${errors.date ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              padding: '10px 14px',
              color: '#d4dce8',
              fontSize: 13,
              fontFamily: '"JetBrains Mono", monospace',
              outline: 'none',
              boxSizing: 'border-box',
              colorScheme: 'dark',
            }}
          />
          {errors.date && <p style={errorStyle}>{errors.date}</p>}
        </div>
      )}

      {/* Pages + Rating */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Pages</label>
          <input
            type="tel"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            value={pages}
            onChange={e => setPages(e.target.value.replace(/\D/g, ''))}
            placeholder="320"
            maxLength={6}
            style={{
              width: '100%',
              background: '#0d1120',
              border: `1px solid ${errors.pages ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              padding: '10px 14px',
              color: '#d4dce8',
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {errors.pages && <p style={errorStyle}>{errors.pages}</p>}
        </div>
        <div>
          <label style={labelStyle}>Rating</label>
          <select
            value={rating}
            onChange={e => setRating(e.target.value ? Number(e.target.value) : '')}
            style={{
              width: '100%',
              background: '#0d1120',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '10px 14px',
              color: '#d4dce8',
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
              boxSizing: 'border-box',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238096b4' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundColor: '#0d1120',
              paddingRight: 32,
            }}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(r => (
              <option key={r} value={r}>{'★'.repeat(r)}{'☆'.repeat(5-r)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Genre */}
      <div>
        <label style={labelStyle}>Genre</label>
        <input
          value={genre}
          onChange={e => setGenre(e.target.value)}
          placeholder="Technology"
          style={{
            width: '100%',
            background: '#0d1120',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '10px 14px',
            color: '#d4dce8',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Language */}
      <div>
        <label style={labelStyle}>Language</label>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{
            width: '100%',
            background: '#0d1120',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '10px 14px',
            color: '#d4dce8',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            boxSizing: 'border-box',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238096b4' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundColor: '#0d1120',
            paddingRight: 32,
          }}
        >
          <option value="">— Select language —</option>
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Your thoughts, quotes, key takeaways..."
          rows={3}
          style={{
            width: '100%',
            background: '#0d1120',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '10px 14px',
            color: '#d4dce8',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
        <button
          type="submit"
          className="btn-primary"
          style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
          disabled={saving}
        >
          {saving ? 'Saving...' : book ? 'Save Changes' : 'Add Book'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
