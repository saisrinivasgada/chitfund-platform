import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';

function subscribe(onChange) {
  const media = window.matchMedia(QUERY);
  if (media.addEventListener) {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

export default function useDesktopViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
