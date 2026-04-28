import React, { useEffect, useRef } from 'react';

interface ConfettiProps {
  x: number;
  y: number;
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  shape: 'circle' | 'rect';
  alpha: number;
}

const COLORS = ['var(--gold)', 'var(--gold-light)', '#f0d78c', '#b8943f', '#d4b05a'];
const GRAVITY = 0.25;
const PARTICLE_COUNT = 25;
const DURATION = 1500;

export default function Confetti({ x, y, onComplete }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Init particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3, // slight upward burst
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        size: 3 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() > 0.5 ? 'circle' : 'rect',
        alpha: 1,
      };
    });

    const draw = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.vx *= 0.98;
        p.rotation += p.rotationSpeed;
        p.alpha = 1 - Math.pow(progress, 2);

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }

        ctx.restore();
      });

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [x, y, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    />
  );
}
