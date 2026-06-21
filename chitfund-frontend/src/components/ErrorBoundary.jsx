import { Component } from 'react';

const styles = `
  @keyframes spin-slow   { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
  @keyframes spin-rev    { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
  @keyframes spin-medium { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
  @keyframes bounce-wrench {
    0%, 100% { transform: rotate(-20deg) translateY(0); }
    50%       { transform: rotate(20deg)  translateY(-6px); }
  }
  @keyframes flicker {
    0%, 100% { opacity: 1; }
    45%      { opacity: 1; }
    50%      { opacity: 0.3; }
    55%      { opacity: 1; }
    75%      { opacity: 0.7; }
    80%      { opacity: 1; }
  }
  @keyframes float-up {
    0%   { transform: translateY(0)   scale(1);   opacity: 0.8; }
    100% { transform: translateY(-40px) scale(0.4); opacity: 0; }
  }
  .gear-lg  { animation: spin-slow   4s linear infinite; }
  .gear-md  { animation: spin-rev    3s linear infinite; }
  .gear-sm  { animation: spin-medium 2s linear infinite; }
  .wrench   { animation: bounce-wrench 1.4s ease-in-out infinite; }
  .flicker  { animation: flicker 3s ease-in-out infinite; }
  .spark-1  { animation: float-up 1.8s ease-out infinite; }
  .spark-2  { animation: float-up 2.2s ease-out 0.6s infinite; }
  .spark-3  { animation: float-up 1.5s ease-out 1.1s infinite; }
`;

function Gear({ size = 60, teeth = 8, className = '' }) {
  const r = size / 2;
  const innerR = r * 0.6;
  const toothH = r * 0.22;
  const toothW = (2 * Math.PI * r) / (teeth * 2.8);

  const points = [];
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * 2 * Math.PI;
    const nextA  = ((i + 0.5) / teeth) * 2 * Math.PI;
    const gapA1  = ((i + 0.35) / teeth) * 2 * Math.PI;
    const gapA2  = ((i + 0.65) / teeth) * 2 * Math.PI;

    const cos = Math.cos, sin = Math.sin;
    const tw = toothW / r;

    points.push(
      `${cos(angle - tw) * r},${sin(angle - tw) * r}`,
      `${cos(angle - tw) * (r + toothH)},${sin(angle - tw) * (r + toothH)}`,
      `${cos(angle + tw) * (r + toothH)},${sin(angle + tw) * (r + toothH)}`,
      `${cos(angle + tw) * r},${sin(angle + tw) * r}`,
      `${cos(gapA1) * r},${sin(gapA1) * r}`,
      `${cos(gapA2) * r},${sin(gapA2) * r}`,
    );
    void nextA;
  }

  return (
    <svg
      width={size + toothH * 2 + 4}
      height={size + toothH * 2 + 4}
      viewBox={`${-r - toothH - 2} ${-r - toothH - 2} ${(r + toothH + 2) * 2} ${(r + toothH + 2) * 2}`}
      className={className}
    >
      <polygon points={points.join(' ')} fill="currentColor" />
      <circle cx="0" cy="0" r={innerR} fill="white" />
      <circle cx="0" cy="0" r={innerR * 0.3} fill="currentColor" />
    </svg>
  );
}

function ErrorScene() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 260, height: 200 }}>
      {/* Background sparks */}
      <div className="spark-1 absolute" style={{ left: 80, top: 60, color: '#D4A017', fontSize: 10 }}>✦</div>
      <div className="spark-2 absolute" style={{ left: 160, top: 80, color: '#D4A017', fontSize: 8 }}>✦</div>
      <div className="spark-3 absolute" style={{ left: 120, top: 100, color: '#D4A017', fontSize: 6 }}>✦</div>

      {/* Large gear — back left */}
      <div className="gear-lg absolute" style={{ left: 10, top: 30, color: '#1E3A5F' }}>
        <Gear size={80} teeth={10} />
      </div>

      {/* Medium gear — meshes with large */}
      <div className="gear-md absolute" style={{ left: 88, top: 14, color: '#2d5a8e' }}>
        <Gear size={54} teeth={7} />
      </div>

      {/* Small gear — top right */}
      <div className="gear-sm absolute" style={{ left: 148, top: 0, color: '#1E3A5F' }}>
        <Gear size={36} teeth={5} />
      </div>

      {/* Small gear — bottom right */}
      <div className="gear-md absolute" style={{ left: 160, top: 80, color: '#2d5a8e' }}>
        <Gear size={44} teeth={6} />
      </div>

      {/* Wrench */}
      <div className="wrench absolute" style={{ left: 50, top: 110, transformOrigin: 'bottom center' }}>
        <svg width="36" height="70" viewBox="0 0 36 70" fill="none">
          <rect x="14" y="18" width="8" height="48" rx="4" fill="#D4A017" />
          <ellipse cx="18" cy="14" rx="14" ry="14" fill="#D4A017" />
          <ellipse cx="18" cy="14" rx="8" ry="8" fill="#fff" fillOpacity="0.25" />
          <rect x="14" y="6" width="8" height="16" rx="2" fill="#1E3A5F" />
        </svg>
      </div>

      {/* Flicker warning light */}
      <div
        className="flicker absolute rounded-full"
        style={{ right: 20, top: 130, width: 18, height: 18, background: '#ef4444', boxShadow: '0 0 10px #ef4444aa' }}
      />

      {/* Ground line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200" />
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const goBack = () => {
      this.setState({ hasError: false, error: null });
      window.history.back();
    };

    const reload = () => {
      this.setState({ hasError: false, error: null });
    };

    return (
      <>
        <style>{styles}</style>
        <div
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
        >
          <div className="text-center max-w-md w-full">
            <div className="flex justify-center mb-6">
              <ErrorScene />
            </div>

            <div className="mb-2 text-xs font-bold tracking-widest uppercase text-gray-400">
              Maintenance in Progress
            </div>

            <h1
              className="text-2xl font-bold mb-3"
              style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
            >
              Our engineers are on it
            </h1>

            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
              Something went wrong on this page. Our team is already working to fix it.
              You can go back or try refreshing.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={goBack}
                style={{ backgroundColor: '#1E3A5F' }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold
                           hover:opacity-90 active:opacity-80 transition-opacity cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M5 12l7 7M5 12l7-7" />
                </svg>
                Go Back
              </button>

              <button
                onClick={reload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                           border border-gray-200 bg-white text-gray-700
                           hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Try Again
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-8 text-left rounded-xl border border-red-200 bg-red-50 p-4">
                <summary className="text-xs font-semibold text-red-600 cursor-pointer">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 text-[11px] text-red-700 whitespace-pre-wrap break-all overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      </>
    );
  }
}
