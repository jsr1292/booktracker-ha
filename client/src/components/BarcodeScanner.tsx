import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetected: (isbn: string) => void;
  onClose: () => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Script load failed'));
    document.head.appendChild(s);
  });
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const quaggaRef = useRef<any>(null);
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
    try { quaggaRef.current?.stop?.(); } catch (_) {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await loadScript('https://unpkg.com/@ericblade/quagga2@1.8.4/dist/quagga.min.js');
        if (!mounted) return;

        // @ts-ignore
        const Quagga = window.Quagga;

        let stream: MediaStream | null = null;
        const constraints = [
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          { video: { facingMode: 'environment' } },
          { video: true },
        ];

        for (const c of constraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch (_) {}
        }

        if (!stream || !mounted) {
          if (stream) stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          if (mounted) setError('No camera found on this device');
          return;
        }

        streamRef.current = stream;

        const container = containerRef.current!;
        container.innerHTML = '';
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px;';
        container.appendChild(video);

        const scanArea = document.createElement('div');
        scanArea.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;';
        scanArea.innerHTML = `
          <div style="position:absolute;inset:24px;border:2px solid rgba(0,209,255,0.35);border-radius:12px;box-shadow:0 0 20px rgba(0,209,255,0.1) inset;"></div>
          <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:rgba(0,209,255,0.5);animation:scan 2s ease-in-out infinite;"></div>
        `;
        container.appendChild(scanArea);

        const style = document.createElement('style');
        style.textContent = '@keyframes scan{0%,100%{top:20%;opacity:0}50%{top:80%;opacity:1}}';
        container.appendChild(style);

        Quagga.init(
          {
            inputStream: { type: 'LiveStream', target: video },
            decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader'] },
            locate: true,
            locator: { patchSize: 'medium', halfSample: true },
          },
          (err: string) => {
            if (err || !mounted) return;
            if (err === 'stream_not_supported') { setError('Camera not supported'); return; }
            Quagga.start();
          }
        );

        quaggaRef.current = Quagga;

        Quagga.onDetected((result: any) => {
          if (!mounted) return;
          const code = result?.codeResult?.code;
          if (!code || (code.length !== 13 && code.length !== 10)) return;
          const now = Date.now();
          // Deduplicate: ignore the same code within 3 seconds
          if (lastCodeRef.current === code && now - lastTimeRef.current < 3000) return;
          lastCodeRef.current = code;
          lastTimeRef.current = now;
          stopCamera();
          onDetectedRef.current(code);
        });
      } catch (err: any) {
        if (!mounted) return;
        if (err.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access in your browser settings.');
        else if (err.name === 'NotFoundError') setError('No camera found on this device.');
        else setError(`Camera error: ${err.message || err.name}`);
      }
    };

    // Wrap init() with a 10-second camera initialization timeout
    const initWithTimeout = Promise.race([
      init(),
      new Promise<void>((_, reject) =>
        setTimeout(() => { if (mounted) { stopCamera(); reject(new Error('Camera initialization timed out')); } }, 10000)
      ),
    ]);

    initWithTimeout.catch((err: any) => {
      if (!mounted) return;
      setError(err.message || 'Camera initialization timed out');
    });

    return () => {
      mounted = false;
      stopCamera();
    };
  }, []); // intentionally empty — uses onDetectedRef

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#07090f' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: 12,
          background: 'rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '8px 16px',
            color: '#d4dce8',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Cancel
        </button>
        <div className="text-xs font-medium text-white" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scan Barcode</div>
        <div style={{ width: 68 }} />
      </div>

      {/* Camera view */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {error ? (
          showManualEntry ? (
            <div className="text-center" style={{ width: '100%', maxWidth: 280 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <p style={{ fontSize: 13, color: '#8096b4', marginBottom: 16 }}>Enter ISBN manually</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={manualISBN}
                  onChange={e => setManualISBN(e.target.value.replace(/[^\dXx]/g, '').toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { const cleaned = manualISBN.trim(); if (/^\d{10}(\d{3})?$|^\d{9}X$/.test(cleaned)) onDetected(cleaned); } }}
                  placeholder="Enter ISBN"
                  maxLength={13}
                  autoFocus
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d4dce8', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                />
                <button
                  onClick={() => { const cleaned = manualISBN.trim(); if (/^\d{10}(\d{3})?$|^\d{9}X$/.test(cleaned)) onDetected(cleaned); }}
                  style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(0,209,255,0.15)', border: '1px solid rgba(0,209,255,0.3)', color: '#00d1ff', fontSize: 12, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
                >
                  Search
                </button>
              </div>
              <button onClick={() => setShowManualEntry(false)} style={{ marginTop: 12, fontSize: 11, color: '#6a7a8a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>← Back</button>
            </div>
          ) : (
            <div className="text-center">
              <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
              <p style={{ fontSize: 14, color: '#ff4d6a', marginBottom: 16 }}>{error}</p>
              <button onClick={() => setShowManualEntry(true)} style={{ fontSize: 12, color: '#00d1ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}>Enter ISBN manually</button>
              <span style={{ fontSize: 12, color: '#6a7a8a', margin: '0 8px' }}> · </span>
              <button onClick={handleClose} style={{ fontSize: 12, color: '#6a7a8a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}>Close</button>
            </div>
          )
        ) : (
          <>
            <div
              ref={containerRef}
              className="relative w-full max-w-sm aspect-[4/3] rounded-xl overflow-hidden"
              style={{ background: '#0b0f19' }}
            />
            <p style={{ fontSize: 11, color: '#8096b4', marginTop: 16, textAlign: 'center' }}>
              Point camera at book barcode (ISBN)
            </p>
            {!isOnline && (
              <p style={{ fontSize: 10, color: '#6a7a8a', marginTop: 8, textAlign: 'center' }}>
                📡 ISBN lookup requires internet.{' '}
                <button onClick={() => setShowManualEntry(true)} style={{ fontSize: 10, color: '#00d1ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" }}>Enter ISBN manually</button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
