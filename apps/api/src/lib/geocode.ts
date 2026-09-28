import { prisma } from '@fsp/db';
import { logger } from './logger';

interface LatLng { lat: number; lng: number }

interface AddressParts {
  street: string; city: string; state: string; zip: string; country?: string | null;
}

/**
 * Google first when a server-usable key is configured, then the US Census
 * geocoder (free, no key). The production Google key is referer-restricted for
 * the browser, so Google refuses every server-side call with REQUEST_DENIED —
 * without the fallback, no address was ever geocoded and nothing reached the map.
 */
export async function geocodeAddress(parts: AddressParts): Promise<LatLng | null> {
  const query = `${parts.street}, ${parts.city}, ${parts.state} ${parts.zip}`;
  return (await geocodeGoogle(`${query}, ${parts.country || 'US'}`)) ?? (await geocodeCensus(query, parts.country));
}

async function geocodeGoogle(query: string): Promise<LatLng | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
    const json = (await (await fetch(url)).json()) as {
      status: string;
      error_message?: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    if (json.status === 'OK' && json.results[0]) {
      const { lat, lng } = json.results[0].geometry.location;
      return { lat, lng };
    }
    if (json.status !== 'ZERO_RESULTS') {
      logger.debug?.(`[geocode] google ${json.status}: ${json.error_message ?? ''}`);
    }
  } catch {
    // fall through to the next provider
  }
  return null;
}

async function geocodeCensus(query: string, country?: string | null): Promise<LatLng | null> {
  if (country && !['US', 'USA', 'United States'].includes(country)) return null;
  try {
    const url =
      'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
      `?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(query)}`;
    const json = (await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).json()) as {
      result?: { addressMatches?: Array<{ coordinates: { x: number; y: number } }> };
    };
    const match = json.result?.addressMatches?.[0];
    if (match) return { lat: match.coordinates.y, lng: match.coordinates.x };
  } catch (err) {
    logger.warn('[geocode] census lookup failed', { err: String(err) });
  }
  return null;
}

/** Fire-and-forget: geocode then patch the serviceAddress row. */
export function geocodeAndSave(addressId: string, parts: AddressParts): void {
  geocodeAddress(parts).then((coords) => {
    if (!coords) return;
    prisma.serviceAddress.update({
      where: { id: addressId },
      data: { lat: coords.lat, lng: coords.lng },
    }).catch(() => {});
  }).catch(() => {});
}

/** Fire-and-forget: geocode then patch the property row. */
export function geocodePropertyAndSave(propertyId: string, parts: AddressParts): void {
  geocodeAddress(parts).then((coords) => {
    if (!coords) return;
    prisma.property.update({ where: { id: propertyId }, data: coords }).catch(() => {});
  }).catch(() => {});
}
