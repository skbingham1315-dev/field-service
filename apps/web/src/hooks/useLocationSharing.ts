import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const INTERVAL_MS = 30_000; // post location every 30 seconds

export function useLocationSharing() {
  const user = useAuthStore((s) => s.user);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);

  const isFieldRole = user?.role === 'technician' || user?.role === 'sales';

  useEffect(() => {
    if (!isFieldRole || !navigator.geolocation) return;

    const postLocation = (pos: GeolocationPosition) => {
      lastPosRef.current = pos;
      api.post('/users/me/location', {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? undefined,
        speed: pos.coords.speed ?? undefined,
      }).catch(() => {/* silent — don't disrupt UX on network error */});
    };

    // Get initial position (triggers browser permission prompt)
    navigator.geolocation.getCurrentPosition(postLocation, () => {/* denied — silent */}, { enableHighAccuracy: true });

    // Watch for movement
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { lastPosRef.current = pos; },
      () => {},
      { enableHighAccuracy: true }
    );

    // Post on interval even if not moving
    intervalRef.current = setInterval(() => {
      if (lastPosRef.current) postLocation(lastPosRef.current);
    }, INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isFieldRole]);
}
