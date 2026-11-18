import { useEffect, useState } from 'react';
import { checkUsernameAvailability } from '../services/api';

export const normalizeUsernameInput = (value) => value.toLowerCase()
  .replace(/[^a-z0-9._]/g, '')
  .replace(/^[._]+/, '');

export const isValidUsername = (value) => /^[a-z0-9][a-z0-9._]{2,29}$/.test(value);

export default function useUsernameAvailability(username, currentUsername = '') {
  const [result, setResult] = useState({ username: '', status: 'idle' });

  useEffect(() => {
    if (!isValidUsername(username) || username === currentUsername) return;

    let active = true;
    const controller = new AbortController();
    setResult({ username, status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const availability = await checkUsernameAvailability(username, controller.signal);
        if (active) setResult({ username, status: availability.available ? 'available' : 'taken' });
      } catch {
        if (active) setResult({ username, status: 'unknown' });
      }
    }, 650);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, currentUsername]);

  if (!username || username === currentUsername) return 'idle';
  if (!isValidUsername(username)) return 'invalid';
  return result.username === username ? result.status : 'checking';
}
