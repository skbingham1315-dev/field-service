/**
 * Base map tiles for every Leaflet map in the app.
 *
 * CARTO's basemaps started requiring an API key (tiles render as an
 * "API KEY REQUIRED" watermark without one), so we use OpenStreetMap's standard
 * tiles, which need no key. OSM's tile policy requires the attribution below and
 * expects light traffic; if usage grows, move to a keyed provider here.
 */
export const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const MAP_TILE_MAX_ZOOM = 19;
