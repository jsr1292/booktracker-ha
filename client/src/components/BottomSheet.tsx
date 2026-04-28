import React, { useRef, useEffect, useState, useCallback } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function BottomSheet({ open, onClose, children, maxHeight = '70vh' }: BottomSheetProps) {
  const [translateY, setTranslateY] = useState('100%');
  const [opacity, setOpacity] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startTranslateRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (open) {
      // Animate in
      requestAnimationFrame(() => {
        setTranslateY('0%');
        setOpacity(1);
      });
    } else {
      setTranslateY('100%');
      setOpacity(0);
    }
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    const sheet = sheetRef.current;
    if (sheet) {
      startTranslateRef.current = sheet.getBoundingClientRect().top;
    }
    isDraggingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      // Only allow dragging down
      const newTranslate = Math.max(0, delta);
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${newTranslate}px)`;
        sheetRef.current.style.transition = 'none';
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const currentTop = sheet.getBoundingClientRect().top;
    const delta = currentTop - startTranslateRef.current;

    if (delta > 80) {
      // Close
      triggerHaptic();
      onClose();
    } else {
      // Snap back
      sheet.style.transform = 'translateY(0)';
      sheet.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
    }
    startYRef.current = null;
  }, [onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 200,
          opacity,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight,
          background: 'var(--card)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '16px 16px 0 0',
          zIndex: 201,
          transform: translateY,
          transition: open
            ? 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)'
            : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drag handle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 0 0',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36,
            height: 4,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 2,
          }} />
        </div>

        {/* Content */}
        <div style={{
          overflowY: 'auto',
          flex: 1,
          padding: '8px 0 0',
        }}>
          {children}
        </div>
      </div>
    </>
  );
}

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  } catch {}
}
