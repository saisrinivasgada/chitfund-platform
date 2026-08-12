import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function ErrorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  const { code = 500, title = 'Something went wrong', message = 'An unexpected error occurred. Please try again.' } =
    location.state ?? {};

  useEffect(() => {
    // Stagger animation entrance
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const isNotFound = code === 404;
  const isForbidden = code === 403;

  const accent = isNotFound ? '#1E3A5F' : isForbidden ? '#D97706' : '#DC2626';
  const accentBg = isNotFound ? '#EEF2F8' : isForbidden ? '#FEF3C7' : '#FEF2F2';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: '#F0F2F5' }}
    >
      {/* Animated card */}
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
        }}
      >
        {/* Accent top bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />

        <div className="px-8 py-10 flex flex-col items-center text-center gap-5">
          {/* Animated icon */}
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ backgroundColor: accentBg }}
          >
            <SorryAnimation code={code} accent={accent} />
          </div>

          {/* Error code */}
          <div
            className="text-5xl font-extrabold tabular-nums"
            style={{ color: accent, fontFamily: 'Merriweather, serif', letterSpacing: '-0.03em' }}
          >
            {code}
          </div>

          {/* Title */}
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{message}</p>
          </div>

          {/* Bouncing dots — "sorry" animation */}
          <div className="flex items-end gap-1.5 h-6">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full inline-block"
                style={{
                  backgroundColor: accent,
                  opacity: 0.6,
                  animation: `bounce-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 w-full pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: accent }}
            >
              ← Go Back
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>

      {/* Subtle brand */}
      <p className="mt-8 text-xs text-gray-400" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</p>

      {/* Keyframe style */}
      <style>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

function SorryAnimation({ code, accent }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 3), 900);
    return () => clearInterval(t);
  }, []);

  const isNotFound = code === 404;
  const isForbidden = code === 403;

  if (isNotFound) {
    // Searching magnifier
    return (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="20" cy="20" r="12" stroke={accent} strokeWidth="3" />
        <line x1="29" y1="29" x2="40" y2="40" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        {/* Oscillating expression */}
        <circle cx="16" cy="18" r="1.5" fill={accent} />
        <circle cx="24" cy="18" r="1.5" fill={accent} />
        <path
          d={frame === 1 ? 'M 15 24 Q 20 22 25 24' : 'M 15 24 Q 20 26 25 24'}
          stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none"
          style={{ transition: 'd 0.3s' }}
        />
      </svg>
    );
  }

  if (isForbidden) {
    // Lock with shake
    return (
      <svg
        width="48" height="48" viewBox="0 0 48 48" fill="none"
        style={{ animation: 'shake 0.8s ease-in-out infinite' }}
      >
        <style>{`@keyframes shake { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-6deg)} 60%{transform:rotate(6deg)} }`}</style>
        <rect x="10" y="22" width="28" height="20" rx="4" fill={accent} fillOpacity="0.15" stroke={accent} strokeWidth="2.5" />
        <path d="M16 22v-6a8 8 0 0 1 16 0v6" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="24" cy="32" r="3" fill={accent} />
      </svg>
    );
  }

  // Server error — pulsing warning
  return (
    <svg
      width="48" height="48" viewBox="0 0 48 48" fill="none"
      style={{ animation: 'pulse-err 1s ease-in-out infinite' }}
    >
      <style>{`@keyframes pulse-err { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.92)} }`}</style>
      <path d="M24 6L44 40H4L24 6Z" fill={accent} fillOpacity="0.12" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="24" y1="18" x2="24" y2="30" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="36" r="2" fill={accent} />
    </svg>
  );
}
