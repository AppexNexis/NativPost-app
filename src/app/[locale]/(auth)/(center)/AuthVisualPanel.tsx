'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const LINES = [
  { brand: 'Brand Profile Builder', line: 'Capture your tone, voice, and audience once. Every post reflects it perfectly.' },
  { brand: 'Anti-Slop Quality Filter', line: 'Every post is scored before you see it. Clichés and robotic copy are automatically rejected.' },
  { brand: 'Multi-Platform Publishing', line: 'One approval. Instantly live on Instagram, LinkedIn, X, Facebook, TikTok, and more.' },
  { brand: 'Approval & Scheduling', line: 'Preview, approve, edit, or reject posts in one dashboard. Schedule across all platforms.' },
];

export default function AuthVisualPanel() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % LINES.length);
        setVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const item = LINES[idx]!;

  return (
    <aside className="ap">
      {/* Subtle noise grain overlay */}
      <div className="ap-grain" aria-hidden />

      {/* Top — logo */}
      <div className="ap-top">
        <Image
          src="/assets/images/shared/main-logo-dark.svg"
          alt="NativPost"
          width={130}
          height={28}
          priority
        />
      </div>

      {/* Middle — editorial headline */}
      <div className="ap-mid">
        <p className="ap-eyebrow">Social media, automated.</p>
        <h2 className="ap-headline">
          Your brand's voice.
          <br />
          Every platform.
          <br />
          Every day.
        </h2>
      </div>

      {/* Bottom — rotating testimonial + stats */}
      <div className="ap-bottom">
        <div className={`ap-quote ${visible ? 'ap-quote-in' : 'ap-quote-out'}`}>
          <p className="ap-quote-text">
            "
            {item.line}
            "
          </p>
          <p className="ap-quote-brand">
            —
            {item.brand}
          </p>
        </div>

        <div className="ap-divider" />

        <div className="ap-stats">
          <div className="ap-stat">
            <span className="ap-stat-n">9+</span>
            <span className="ap-stat-l">Social platforms</span>
          </div>
          <div className="ap-stat">
            <span className="ap-stat-n">7 days</span>
            <span className="ap-stat-l">Free trial</span>
          </div>
          <div className="ap-stat">
            <span className="ap-stat-n">$0</span>
            <span className="ap-stat-l">Due today</span>
          </div>
        </div>
      </div>

      <style>
        {`
        .ap {
          display: none;
          position: relative;
          overflow: hidden;
          background: #0b0b0e;
          flex-direction: column;
          justify-content: space-between;
          padding: 44px 52px;
        }
        @media (min-width: 1024px) {
          .ap { display: flex; width: 46%; flex-shrink: 0; }
        }
        @media (min-width: 1280px) {
          .ap { width: 50%; padding: 52px 64px; }
        }

        /* Grain */
        .ap-grain {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          opacity: 0.028;
          pointer-events: none;
          z-index: 0;
        }

        /* Accent color wash — bottom right */
        .ap::after {
          content: '';
          position: absolute;
          bottom: -180px;
          right: -120px;
          width: 480px;
          height: 480px;
          background: radial-gradient(circle, rgba(134,79,254,0.18) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .ap-top, .ap-mid, .ap-bottom {
          position: relative;
          z-index: 1;
        }

        /* Logo */
        .ap-top img { display: block; }

        /* Headline */
        .ap-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .ap-eyebrow {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(252,252,252,0.35);
          margin: 0 0 20px;
          font-family: 'Inter Tight', system-ui, sans-serif;
        }
        .ap-headline {
          font-family: 'Inter Tight', system-ui, sans-serif;
          font-size: clamp(32px, 3.2vw, 48px);
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -1.5px;
          color: #f5f5f7;
          margin: 0;
        }

        /* Quote */
        .ap-quote {
          margin-bottom: 32px;
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .ap-quote-in  { opacity: 1; transform: translateY(0); }
        .ap-quote-out { opacity: 0; transform: translateY(6px); }

        .ap-quote-text {
          font-size: 15px;
          font-style: italic;
          color: rgba(252,252,252,0.55);
          line-height: 1.6;
          margin: 0 0 10px;
          font-family: 'Inter Tight', system-ui, sans-serif;
        }
        .ap-quote-brand {
          font-size: 11px;
          font-weight: 600;
          color: rgba(252,252,252,0.25);
          letter-spacing: 0.04em;
          margin: 0;
          font-family: 'Inter Tight', system-ui, sans-serif;
        }

        /* Divider */
        .ap-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin-bottom: 28px;
        }

        /* Stats */
        .ap-stats { display: flex; gap: 32px; }
        .ap-stat { display: flex; flex-direction: column; gap: 4px; }
        .ap-stat-n {
          font-size: 22px;
          font-weight: 700;
          color: #f5f5f7;
          letter-spacing: -0.5px;
          font-family: 'Inter Tight', system-ui, sans-serif;
        }
        .ap-stat-l {
          font-size: 11px;
          color: rgba(252,252,252,0.3);
          font-family: 'Inter Tight', system-ui, sans-serif;
        }
      `}
      </style>
    </aside>
  );
}
