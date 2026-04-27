import React, { useState, useEffect, useRef } from 'react';

interface ProgressRingProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}

export default function ProgressRing({
  progress,
  size = 40,
  strokeWidth = 3,
  color = '#c9a84c',
  bgColor = '#1e2a42',
}: ProgressRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const prevProgressRef = useRef(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animatedProgress);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimatedProgress(progress);
      return;
    }

    const startVal = prevProgressRef.current;
    let start: number | null = null;
    const duration = 800;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedProgress(startVal + (progress - startVal) * eased);
      if (p < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    prevProgressRef.current = progress;
  }, [progress]);

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.05s linear' }}
      />
    </svg>
  );
}
