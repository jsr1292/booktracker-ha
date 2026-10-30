import { useState, useEffect, useRef } from 'react';
import type { Book } from '../types';
import { TitleSearch, useBookSearch } from './TitleSearch';
import { fetchWorkDetails } from '../lib/openLibrary';
import type { BookResult } from '../api/bookLookup';
import { lookupISBN } from '../api/bookLookup';

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
  current_page: number | null;
  isbn: string | null;
  openlibrary_key: string | null;
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
  onSave: (data: BookFormData) => Promise<void>;
  onCancel: () => void;
  notice?: string | null;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--text)',
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
  backgroundColor: 'var(--bg3)',
  paddingRight: 28,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text2)',
  marginBottom: 5,
  marginTop: 2,
  fontFamily: "'JetBrains Mono', monospace",
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

export default function BookForm({ book, initialData, onSave, onCancel, notice }: Props) {
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
  const [currentPage, setCurrentPage] = useState(book?.current_page?.toString() ?? initialData?.current_page?.toString() ?? '');
  const [isbn, setIsbn] = useState(book?.isbn ?? initialData?.isbn ?? '');
  const [workKey, setWorkKey] = useState(book?.openlibrary_key ?? initialData?.openlibrary_key ?? null);
  const [isbnError, setIsbnError] = useState<string | null>(null);
  const [isbnLoading, setIsbnLoading] = useState(false);
  const [rating, setRating] = useState<number | ''>(book?.rating ?? initialData?.rating ?? '');
  const [genre, setGenre] = useState(book?.genre ?? initialData?.genre ?? '');
  const [language, setLanguage] = useState(book?.language ?? initialData?.language ?? '');
  const [description, setDescription] = useState(book?.description ?? initialData?.description ?? '');
  const [notes, setNotes] = useState(book?.notes ?? initialData?.notes ?? '');
  const [coverUrl, setCoverUrl] = useState(book?.cover_url ?? initialData?.cover_url ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [showMore, setShowMore] = useState(!!(book?.notes || book?.description || book?.language));

  // When switching to 'reading', auto-fill dateStarted if empty
  useEffect(() => {
    if (status === 'reading' && !dateStarted) {
      setDateStarted(today);
    }
  }, [status]);

  const [autoFilled, setAutoFilled] = useState(false);

  const { suggestions, searching, error, searched, search } = useBookSearch();

  const selectionSeq = useRef(0);
  const genreEdited = useRef(false);

  useEffect(() => {
    const key = book?.openlibrary_key ?? initialData?.openlibrary_key;
    if (!key || (book?.genre ?? initialData?.genre) && (book?.description ?? initialData?.description)) return;
    let active = true;
    fetchWorkDetails(key).then(details => {
      if (!active) return;
      if (!(book?.genre ?? initialData?.genre) && !genreEdited.current) setGenre(details.genre ?? '');
      if (!(book?.description ?? initialData?.description)) setDescription(details.description ?? '');
    }).catch(() => {});
    return () => { active = false; };
  }, [book?.openlibrary_key, initialData?.openlibrary_key]);

  const handleSelect = (result: BookResult) => {
    const seq = ++selectionSeq.current;
    genreEdited.current = false;
    setTitle(result.title);
    setAuthor(result.author);
    setPages(result.pages?.toString() ?? '');
    setGenre(result.genre ?? '');
    setLanguage(result.language ?? '');
    setDescription(result.description ?? '');
    setCoverUrl(result.coverUrl ?? '');
    setWorkKey(result.key);
    setIsbn('');
    setAutoFilled(true);
    setErrors(p => ({ ...p, title: '' }));
    if (result.key) {
      fetchWorkDetails(result.key).then(details => {
        if (seq !== selectionSeq.current) return;
        if (!genreEdited.current) setGenre(details.genre ?? '');
        setDescription(details.description ?? '');
      });
    }
  };

  const [showSuggestions, setShowSuggestions] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Required';
    if (!author.trim()) e.author = 'Required';
    if (status === 'finished' && !dateFinished) e.date = 'Required';
    if (pages && (isNaN(Number(pages)) || Number(pages) <= 0)) e.pages = 'Invalid';
    if (currentPage && (!Number.isSafeInteger(Number(currentPage)) || Number(currentPage) <= 0)) e.currentPage = 'Invalid';
    if (rating !== '' && (Number(rating) < 1 || Number(rating) > 5)) e.rating = '1-5';
    if (dateStarted && dateFinished && new Date(dateStarted + 'T00:00:00') > new Date(dateFinished + 'T00:00:00')) {
      e.dateStarted = 'Must be before finish date';
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    savingRef.current = true;
    setSaveError(null);
    setSaving(true);
    try {
      const bookData: BookFormData = {
        title: title.trim(),
        author: author.trim(),
        date_finished: status === 'finished' ? dateFinished : null,
        pages: pages ? Number(pages) : null,
        current_page: status === 'reading' && currentPage ? Math.min(Number(currentPage), pages ? Number(pages) : Number(currentPage)) : null,
        isbn: isbn.trim() || null,
        openlibrary_key: workKey,
        rating: rating !== '' ? Number(rating) : null,
        genre: genre.trim() || null,
        language: language.trim() || null,
        cover_url: coverUrl.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        status,
        date_started: status === 'reading' ? (dateStarted || today) : (status === 'finished' ? dateStarted || null : null),
      };
      await onSave(bookData);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save book');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const errStyle: React.CSSProperties = { fontSize: 12, color: 'var(--red)', marginTop: 2 };

  return (
    <form onSubmit={handleSubmit} style={sectionStyle}>

      {notice && <p style={{ fontSize: 13, color: 'var(--gold)' }}>{notice}</p>}

      {/* Auto-fill notice */}
      {autoFilled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)', fontSize: 12, color: 'var(--green)' }}>
          ✓ Auto-filled from search
        </div>
      )}

      {/* Title with search */}
      <div>
        <label style={labelStyle}>Title *</label>
        <div onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}>
          <TitleSearch
            value={title}
            onChange={val => { selectionSeq.current++; setWorkKey(null); setTitle(val); setAutoFilled(false); setErrors(p => ({ ...p, title: '' })); }}
            onSelect={handleSelect}
            suggestions={showSuggestions ? suggestions : []}
            searching={searching && showSuggestions}
            error={error}
            searched={searched && showSuggestions}
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
          style={{ ...inputStyle, border: `1px solid ${errors.author ? '#ff4d6a' : 'var(--card-border)'}` }}
        />
        {errors.author && <p style={errStyle}>{errors.author}</p>}
      </div>

      {/* Status on its own row, so Pages and Rating have room for their values */}
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Pages</label>
          <input
            aria-label="Pages"
            type="tel"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            value={pages}
            onChange={e => setPages(e.target.value.replace(/\D/g, ''))}
            placeholder="320"
            maxLength={6}
            style={{ ...inputStyle, border: `1px solid ${errors.pages ? '#ff4d6a' : 'var(--card-border)'}` }}
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

      {status === 'reading' && <div>
        <label style={labelStyle}>Current page
          <input inputMode="numeric" enterKeyHint="done" value={currentPage} onChange={e => setCurrentPage(e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle, marginTop: 5 }} />
        </label>
        {errors.currentPage && <p style={errStyle}>{errors.currentPage}</p>}
      </div>}

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
              style={{ ...inputStyle, border: `1px solid ${errors.dateStarted ? '#ff4d6a' : 'var(--card-border)'}` }}
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
                style={{ ...inputStyle, border: `1px solid ${errors.date ? '#ff4d6a' : 'var(--card-border)'}` }}
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
          onChange={e => { genreEdited.current = true; setGenre(e.target.value); }}
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
          color: 'var(--text2)',
          fontSize: 12,
          cursor: 'pointer',
          minHeight: 44,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'left' }}
      >
        {showMore ? '▾ Less options' : '▸ More options (language, notes)'}
      </button>

      {showMore && (
        <>
          <div>
            <label style={labelStyle}>ISBN
              <input value={isbn} onChange={e => setIsbn(e.target.value)} autoComplete="off" style={{ ...inputStyle, marginTop: 5 }} />
            </label>
            <button type="button" className="btn-ghost" disabled={isbnLoading} style={{ minHeight: 44, marginTop: 8, width: '100%' }} onClick={async () => {
              setIsbnError(null);
              if (!/^(?:\d{9}[\dXx]|\d{13})$/.test(isbn.replace(/[\s-]/g, ''))) { setIsbnError('Enter a 10 or 13 digit ISBN'); return; }
              setIsbnLoading(true);
              try {
                const result = await lookupISBN(isbn.trim());
                if (!result) { setIsbnError('ISBN not found'); return; }
                setPages(result.pages?.toString() ?? '');
                setCoverUrl(result.coverUrl ?? '');
                setLanguage(result.language ?? '');
                if (!genre.trim()) setGenre(result.genre ?? '');
                if (!description.trim()) setDescription(result.description ?? '');
                if (!title.trim()) setTitle(result.title);
                if (!author.trim()) setAuthor(result.author);
                setWorkKey(result.key);
                setIsbn(result.isbn ?? isbn.trim());
              } catch (error) { setIsbnError(error instanceof Error ? error.message : 'ISBN lookup failed'); }
              finally { setIsbnLoading(false); }
            }}>{isbnLoading ? 'Looking up...' : 'Fill from ISBN'}</button>
            {isbnError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{isbnError}</div>}
          </div>
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
      <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: -20, background: 'var(--bg2)', padding: '8px 0 20px', marginBottom: -20 }}>
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
          style={{ minWidth: 80, minHeight: 44 }}
        >
          Cancel
        </button>
      </div>

      {saveError && <p style={{ fontSize: 13, color: 'var(--red)' }}>{saveError}</p>}
    </form>
  );
}
