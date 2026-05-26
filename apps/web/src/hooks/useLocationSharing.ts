import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { connectSocket, getSocket } from '../lib/socket';

const INTERVAL_MS = 30_000; // post location every 30 seconds

export function useLocationSharing() {
  const user = useAuthStore((s) => s.user);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);

  const isFieldRole = user?.role === 'technician' || user?.role === 'sales';

  useEffect(() => {
    if (!isFieldRole || !navigator.geolocation) return;

    // Connect socket so real-time location events reach the dispatch map
    connectSocket();

    const postLocation = (pos: GeolocationPosition) => {
      lastPosRef.current = pos;
      const payload = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? undefined,
        speed: pos.coords.speed ?? undefined,
      };
      // REST — persists lastLat/lastLng to DB (map polling reads this)
      api.post('/users/me/location', payload).catch(() => {});
      // Socket — real-time broadcast to dispatchers watching the live map
      getSocket().emit('technician:location', payload);
    };

    // Get initial position (triggers browser permission prompt)
    navigator.geolocation.getCurrentPosition(postLocation, () => {/* denied — silent */}, { enableHighAccuracy: true });

    // Watch for movement — post immediately on any position change
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { postLocation(pos); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 }
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
