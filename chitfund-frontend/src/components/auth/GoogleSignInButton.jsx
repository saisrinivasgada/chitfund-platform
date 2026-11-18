import { useEffect, useRef, useState } from 'react';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let scriptPromise;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google sign-in could not load. Please try again.'));
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [error, setError] = useState('');
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleScript().then(() => {
      if (!active || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: (response) => {
          if (active && response?.credential) callbackRef.current(response.credential);
        },
      });
      containerRef.current.replaceChildren();
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard', theme: 'outline', size: 'large', text, width: 300,
      });
    }).catch((loadError) => {
      if (active) setError(loadError.message);
    });
    return () => { active = false; };
  }, [text]);

  if (!clientId) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} aria-label="Continue with Google" />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
