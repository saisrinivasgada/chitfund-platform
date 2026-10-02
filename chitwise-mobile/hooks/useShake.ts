import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

const THRESHOLD = 1.6;   // delta-g to count as a shake jolt
const COOLDOWN  = 600;   // ms between recognised shakes

export function useShake(onShake: () => void, enabled = true) {
  const lastMag  = useRef(0);
  const lastFire = useRef(0);
  const cbRef    = useRef(onShake);
  cbRef.current  = onShake;

  useEffect(() => {
    if (!enabled) return;

    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag   = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(mag - lastMag.current);
      lastMag.current = mag;

      const now = Date.now();
      if (delta > THRESHOLD && now - lastFire.current > COOLDOWN) {
        lastFire.current = now;
        cbRef.current();
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
