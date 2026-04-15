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

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '10px 12px',
  color: '#d4dce8',
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238096b4' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  backgroundColor: 'rgba(255,255,255,0.04)',
  paddingRight: 28,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: '#6a7a8a',
  marginBottom: 5,
  marginTop: 2,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono', monospace",
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

export default function BookForm({ book, initialData, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(book?.title ?? initialData?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? initialData?.author ?? '');
  const [status, setStatus] = useState<'reading' | 'finished' | 'abandoned' | 'planned'>(
    book?.status ?? initialData?.status ?? 'reading'
  );
  const today = new Date().toISOString().split('T')[0];
  const [dateFinished, setDateFinished] = useState(
    book?.date_finished ?? initialData?.date_finished ?? today
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
  const [showMore, setShowMore] = useState(!!(book?.notes || book?.description || book?.language));

  // When switching to 'reading', auto-fill dateStarted if empty
  useEffect(() => {
    if (status === 'reading' && !dateStarted) {
      setDateStarted(today);
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
    if (result.description) setDescription(result.description);
    if (result.coverUrl) setCoverUrl(result.coverUrl);
    setAutoFilled(true);
    setErrors(p => ({ ...p, title: '' }));
  };

  const [showSuggestions, setShowSuggestions] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Required';
    if (!author.trim()) e.author = 'Required';
    if (status === 'finished' && !dateFinished) e.date = 'Required';
    if (pages && (isNaN(Number(pages)) || Number(pages) <= 0)) e.pages = 'Invalid';
    if (rating !== '' && (Number(rating) < 1 || Number(rating) > 5)) e.rating = '1-5';
    if (dateStarted && dateFinished && new Date(dateStarted) > new Date(dateFinished)) {
      e.dateStarted = 'Must be before finish date';
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
        date_started: status === 'reading' ? (dateStarted || today) : (status === 'finished' ? dateStarted || null : null),
      };
      onSave(bookData);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save book');
    } finally {
      setSaving(false);
    }
  };

  const errStyle: React.CSSProperties = { fontSize: 9, color: '#ff4d6a', marginTop: 2 };

  return (
    <form onSubmit={handleSubmit} style={sectionStyle}>

      {/* Auto-fill notice */}
      {autoFilled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)', fontSize: 10, color: '#00e5a0' }}>
          ✓ Auto-filled from search
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
        {errors.title && <p style={errStyle}>{errors.title}</p>}
      </div>

      {/* Author */}
      <div>
        <label style={labelStyle}>Author *</label>
        <input
          value={author}
          onChange={e => setAuthor(e.target.value)}
          placeholder="Author name"
          style={{ ...inputStyle, border: `1px solid ${errors.author ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}` }}
        />
        {errors.author && <p style={errStyle}>{errors.author}</p>}
      </div>

      {/* Status + Pages + Rating row */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as 'reading' | 'finished' | 'abandoned' | 'planned')}
            style={selectStyle}
          >
            <option value="reading">📖 Reading</option>
            <option value="planned">📋 Planned</option>
            <option value="finished">✅ Finished</option>
            <option value="abandoned">❌ Abandoned</option>
          </select>
        </div>
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
            style={{ ...inputStyle, border: `1px solid ${errors.pages ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}` }}
          />
        </div>
        <div>
          <label style={labelStyle}>Rating</label>
          <select
            value={rating}
            onChange={e => setRating(e.target.value ? Number(e.target.value) : '')}
            style={selectStyle}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(r => (
              <option key={r} value={r}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates — shown for reading and finished */}
      {(status === 'reading' || status === 'finished') && (
        <div style={{ display: 'grid', gridTemplateColumns: status === 'finished' ? '1fr 1fr' : '1fr', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Date Started</label>
            <input
              type="date"
              value={dateStarted}
              max={status === 'finished' ? dateFinished || today : today}
              onChange={e => setDateStarted(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark', border: `1px solid ${errors.dateStarted ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}` }}
            />
            {errors.dateStarted && <p style={errStyle}>{errors.dateStarted}</p>}
          </div>
          {status === 'finished' && (
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Date Finished *</label>
              <input
                type="date"
                value={dateFinished}
                max={today}
                onChange={e => setDateFinished(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark', border: `1px solid ${errors.date ? '#ff4d6a' : 'rgba(255,255,255,0.08)'}` }}
              />
              {errors.date && <p style={errStyle}>{errors.date}</p>}
            </div>
          )}
        </div>
      )}

      {/* Genre */}
      <div>
        <label style={labelStyle}>Genre</label>
        <input
          value={genre}
          onChange={e => setGenre(e.target.value)}
          placeholder="e.g. Fiction, Science"
          style={inputStyle}
        />
      </div>

      {/* Expandable section for less common fields */}
      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        style={{
          background: 'none',
          border: 'none',
          color: '#6a7a8a',
          fontSize: 9,
          cursor: 'pointer',
          padding: '4px 0',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
      >
        {showMore ? '▾ Less options' : '▸ More options (language, notes)'}
      </button>

      {showMore && (
        <>
          {/* Language */}
          <div>
            <label style={labelStyle}>Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              style={selectStyle}
            >
              <option value="">—</option>
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
              placeholder="Thoughts, quotes..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 6 }}>
        <button
          type="submit"
          className="btn-primary"
          style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
          disabled={saving}
        >
          {saving ? 'Saving...' : book ? 'Save' : 'Add Book'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost"
          style={{ minWidth: 80 }}
        >
          Cancel
        </button>
      </div>

      {saveError && <p style={{ fontSize: 10, color: '#ff4d6a' }}>{saveError}</p>}
    </form>
  );
}
