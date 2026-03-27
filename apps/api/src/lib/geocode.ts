import { prisma } from '@fsp/db';

interface LatLng { lat: number; lng: number }

export async function geocodeAddress(parts: {
  street: string; city: string; state: string; zip: string; country?: string;
}): Promise<LatLng | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const query = `${parts.street}, ${parts.city}, ${parts.state} ${parts.zip}, ${parts.country ?? 'US'}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;

  try {
    const res = await fetch(url);
    const json = await res.json() as { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } } }> };
    if (json.status === 'OK' && json.results[0]) {
      const { lat, lng } = json.results[0].geometry.location;
      return { lat, lng };
    }
  } catch {
    // Non-critical — map just won't show the pin until geocoded
  }
  return null;
}

/** Fire-and-forget: geocode then patch the serviceAddress row. */
export function geocodeAndSave(addressId: string, parts: {
  street: string; city: string; state: string; zip: string; country?: string;
}): void {
  geocodeAddress(parts).then((coords) => {
    if (!coords) return;
    prisma.serviceAddress.update({
      where: { id: addressId },
      data: { lat: coords.lat, lng: coords.lng },
    }).catch(() => {});
  }).catch(() => {});
}
