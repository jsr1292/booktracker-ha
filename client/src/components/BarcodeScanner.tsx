import { useEffect, useRef, useState } from 'react';
import Quagga from '@ericblade/quagga2';

interface Props {
  onDetected: (isbn: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quaggaRef = useRef<typeof Quagga | null>(null);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [manualISBN, setManualISBN] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  const stopCamera = () => {
    try { quaggaRef.current?.stop(); } catch (_) { /* already stopped */ }
    quaggaRef.current = null;
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  useEffect(() => {
    if (showManualEntry) return;
    let mounted = true;
    const container = containerRef.current;
    if (!container) return;

    if (!window.isSecureContext || !navigator.mediaDevices) {
      setError('The camera needs HTTPS.');
      return;
    }

    const handleError = (err: unknown) => {
      if (!mounted) return;
      const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : String(err);
      if (name.includes('NotAllowedError')) setError('Camera permission denied. Please allow camera access in your browser settings.');
      else if (name.includes('NotFoundError')) setError('No camera found.');
      else setError('Could not start the camera. Enter ISBN manually.');
      stopCamera();
    };

    const handleDetected = (result: { codeResult?: { code?: string | null } }) => {
      if (!mounted) return;
      const code = result?.codeResult?.code;
      if (!code || !/^97[89]\d{10}$/.test(code)) return;
      const now = Date.now();
      if (lastCodeRef.current === code && now - lastTimeRef.current < 3000) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;
      stopCamera();
      onDetectedRef.current(code);
    };

    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
    overlay.innerHTML = '<div style="position:absolute;inset:24px;border:2px solid rgba(0,209,255,0.35);border-radius:12px;box-shadow:0 0 20px rgba(0,209,255,0.1) inset;"></div><div style="position:absolute;top:50%;left:0;right:0;height:2px;background:rgba(0,209,255,0.5);animation:scan 2s ease-in-out infinite;"></div>';
    container.appendChild(overlay);
    const style = document.createElement('style');
    style.textContent = '@keyframes scan{0%,100%{top:20%;opacity:0}50%{top:80%;opacity:1}}';
    container.appendChild(style);

    try {
      quaggaRef.current = Quagga;
      Quagga.init({
        inputStream: {
          type: 'LiveStream', target: container,
          constraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        },
        decoder: { readers: ['ean_reader'] },
        locate: true,
        locator: { patchSize: 'medium', halfSample: true },
      }, (err: unknown) => {
        if (!mounted) { try { Quagga.stop(); } catch (_) {} return; }
        if (err) { handleError(err); return; }
        try { Quagga.start(); } catch (startError) { handleError(startError); }
      });
      Quagga.onDetected(handleDetected);
    } catch (err) {
      handleError(err);
    }

    return () => {
      mounted = false;
      Quagga.offDetected(handleDetected);
      stopCamera();
    };
  }, [showManualEntry]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: 12,
          background: 'rgba(0,0,0,0.5)' }}
      >
        <button
          onClick={handleClose}
          style={{
            background: 'var(--card-border)',
            border: '1px solid var(--card-border)',
            borderRadius: 6,
            padding: '8px 16px',
            color: 'var(--text)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace" }}
        >
          Cancel
        </button>
        <div className="text-xs font-medium text-white" style={{ textTransform: 'uppercase' }}>Scan Barcode</div>
        <div style={{ width: 68 }} />
      </div>

      {/* Camera view */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {showManualEntry ? (
            <div className="text-center" style={{ width: '100%', maxWidth: 280 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Enter ISBN manually</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={manualISBN}
                  onChange={e => setManualISBN(e.target.value.replace(/[^\dXx]/g, '').toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { const cleaned = manualISBN.trim(); if (/^\d{10}(\d{3})?$|^\d{9}X$/.test(cleaned)) onDetected(cleaned); } }}
                  placeholder="Enter ISBN"
                  maxLength={13}
                  autoFocus
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--border)', border: '1px solid var(--card-border)', color: 'var(--text)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                />
                <button
                  onClick={() => { const cleaned = manualISBN.trim(); if (/^\d{10}(\d{3})?$|^\d{9}X$/.test(cleaned)) onDetected(cleaned); }}
                  style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(0,209,255,0.15)', border: '1px solid rgba(0,209,255,0.3)', color: '#00d1ff', fontSize: 12, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
                >
                  Search
                </button>
              </div>
              <button onClick={() => { setError(null); setShowManualEntry(false); }} style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>← Back</button>
            </div>
        ) : error ? (
          <div className="text-center">
            <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
            <p style={{ fontSize: 14, color: '#ff4d6a', marginBottom: 16 }}>{error}</p>
            <button onClick={() => setShowManualEntry(true)} style={{ fontSize: 12, color: '#00d1ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}>Enter ISBN manually</button>
          </div>
        ) : (
          <>
            {/* The key stops React reusing this div, and Quagga's video inside it, for the other views. */}
            <div
              key="camera"
              ref={containerRef}
              className="scanner-preview relative w-full max-w-sm aspect-[4/3] rounded-xl overflow-hidden"
              style={{ background: '#0b0f19' }}
            />
            <style>{`.scanner-preview video, .scanner-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }`}</style>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 16, textAlign: 'center' }}>
              Point camera at book barcode (ISBN)
            </p>
            <button onClick={() => { stopCamera(); setShowManualEntry(true); }} style={{ marginTop: 12, fontSize: 12, color: '#00d1ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}>Enter ISBN manually</button>
            {!isOnline && (
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
                📡 ISBN lookup requires internet. Manual entry remains available.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
