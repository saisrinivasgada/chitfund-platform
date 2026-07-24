import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

// Animated hourglass SVG — sand drains, then flips and repeats
function HourglassAnimation() {
  const [phase, setPhase] = useState(0); // 0=full top, 1=draining, 2=flipped

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 2200),
    ];
    const loop = setInterval(() => {
      setPhase(0);
      setTimeout(() => setPhase(1), 400);
      setTimeout(() => setPhase(2), 2200);
    }, 3600);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, []);

  const sandTop = phase === 0 ? 1 : phase === 1 ? 0.15 : 0;
  const sandBot = phase === 0 ? 0 : phase === 1 ? 0.7 : 1;
  const flip    = phase === 2;

  return (
    <svg
      width="56" height="56" viewBox="0 0 56 56" fill="none"
      style={{
        transition: 'transform 0.5s cubic-bezier(.68,-0.55,.27,1.55)',
        transform: flip ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      {/* Outer frame */}
      <path d="M14 6h28M14 50h28" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" />
      {/* Left side */}
      <line x1="14" y1="6"  x2="20" y2="26" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="50" x2="20" y2="30" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />
      {/* Right side */}
      <line x1="42" y1="6"  x2="36" y2="26" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />
      <line x1="42" y1="50" x2="36" y2="30" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />

      {/* Top sand */}
      <path
        d={`M20 26 L28 28 L36 26 L${14 + (36 - 14) * (1 - sandTop)} ${6 + (26 - 6) * (1 - sandTop)} L${42 - (42 - 14) * (1 - sandTop)} ${6 + (26 - 6) * (1 - sandTop)} Z`}
        fill="#D4A017" fillOpacity="0.85"
        style={{ transition: 'all 1.6s ease-in' }}
      />

      {/* Neck trickle */}
      {phase === 1 && (
        <line
          x1="28" y1="28" x2="28" y2="30"
          stroke="#D4A017" strokeWidth="1.5" strokeLinecap="round"
          style={{ animation: 'trickle 0.4s ease-in-out infinite alternate' }}
        />
      )}

      {/* Bottom sand */}
      <path
        d={`M20 30 L28 28 L36 30 L${20 + (36 - 20) * sandBot * 0.9} ${30 + (50 - 30) * sandBot} L${20 + (36 - 20) * (1 - sandBot * 0.9)} ${30 + (50 - 30) * sandBot} Z`}
        fill="#D4A017" fillOpacity="0.7"
        style={{ transition: 'all 1.6s ease-in' }}
      />

      <style>{`
        @keyframes trickle {
          from { opacity: 1; transform: scaleY(1); }
          to   { opacity: 0.4; transform: scaleY(0.6); }
        }
      `}</style>
    </svg>
  );
}

export default function SessionExpiredPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [ringIdx, setRingIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    // Ripple rings pulse outward every 2s
    const ring = setInterval(() => setRingIdx((i) => i + 1), 2000);
    return () => { clearTimeout(t); clearInterval(ring); };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-16 relative overflow-hidden"
      style={{ backgroundColor: '#F0F2F5' }}
    >
      {/* Ripple rings in background */}
      {[0, 1, 2].map((i) => (
        <span
          key={`${ringIdx}-${i}`}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 280 + i * 120,
            height: 280 + i * 120,
            border: '1.5px solid rgba(30,58,95,0.12)',
            animation: `ripple-out 2s ease-out ${i * 0.4}s forwards`,
          }}
        />
      ))}

      {/* Card */}
      <div
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden"
        style={{
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(.22,1,.36,1)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.95)',
        }}
      >
        {/* Amber top stripe */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #1E3A5F 0%, #D4A017 100%)' }} />

        <div className="px-8 pt-10 pb-8 flex flex-col items-center text-center gap-6">

          {/* Icon with pulsing halo */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute rounded-full"
              style={{
                width: 96, height: 96,
                backgroundColor: '#EEF2F8',
                animation: 'halo-pulse 2s ease-in-out infinite',
              }}
            />
            <div
              className="relative w-20 h-20 rounded-2xl flex items-center justify-center z-10"
              style={{ backgroundColor: '#EEF2F8' }}
            >
              <HourglassAnimation />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h1
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: 'Merriweather, serif' }}
            >
              Session Expired
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              You've been away for a while and your session has timed out for security. Please sign in again to continue.
            </p>
          </div>

          {/* Animated dots — "waiting" feel */}
          <div className="flex items-end gap-1.5 h-5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: '#1E3A5F',
                  opacity: 0.4,
                  animation: `dot-bounce 1.4s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="w-full space-y-3 pt-1">
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              Sign in again
            </button>
          </div>

          {/* Security note */}
          <p className="text-xs text-gray-400 leading-relaxed">
            Your data is safe. Sessions expire automatically after inactivity to protect your account.
          </p>
        </div>
      </div>

      {/* Brand */}
      <div className="mt-8 flex items-center gap-2 opacity-40">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
          <BookOpen size={11} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-gray-600" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</p>
      </div>

      <style>{`
        @keyframes ripple-out {
          0%   { opacity: 0.6; transform: scale(0.3); }
          100% { opacity: 0;   transform: scale(1); }
        }
        @keyframes halo-pulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.12); opacity: 0.6; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}
