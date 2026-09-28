import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM, MAP_TILE_URL } from '../lib/mapTiles';
import { MemberActivityDrawer } from '../components/MemberActivityDrawer';
import L from 'leaflet';
import { api } from '../lib/api';
import { getSocket, connectSocket } from '../lib/socket';
import { MapPin, User, RefreshCw, ChevronLeft, ChevronRight, Filter, Home } from 'lucide-react';

// Fix Leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeColorIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function makeTechIcon(initials: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#4f46e5;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${initials}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function makeRentalIcon(occupied: boolean, openRequests: number) {
  const bg = occupied ? '#0f766e' : '#94a3b8';
  const ring = openRequests > 0 ? 'box-shadow:0 0 0 3px #f59e0b,0 1px 4px rgba(0,0,0,0.4);' : 'box-shadow:0 1px 4px rgba(0,0,0,0.4);';
  const badge = openRequests > 0
    ? `<div style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#f59e0b;color:white;font-size:10px;font-weight:700;line-height:16px;text-align:center">${openRequests}</div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:26px;height:26px;border-radius:6px;background:${bg};border:2px solid white;${ring}display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>${badge}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

interface RentalPin {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  occupied: boolean;
  leaseEnd: string | null;
  residents: string[];
  openRequests: number;
}

const SHOW_RENTALS_KEY = 'fsp_map_show_rentals';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  draft: '#6b7280',
  cancelled: '#ef4444',
};

interface JobPin {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  customer: { firstName: string; lastName: string } | null;
  technician: { id: string; firstName: string; lastName: string } | null;
  serviceAddress: { street: string; city: string; state: string; zip: string; lat: number | null; lng: number | null } | null;
}

interface TechLocation {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  lastLat: number;
  lastLng: number;
  lastLocationAt: string;
  isAvailable: boolean;
}

// Fit the map to everything on it. Refits when more points arrive (rentals load
// separately from jobs) until the user pans or zooms themselves.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fittedCount = useRef(0);
  const userMoved = useRef(false);
  const latest = useRef(points);
  latest.current = points;

  const fit = useCallback(() => {
    const pts = latest.current;
    if (userMoved.current || pts.length === 0) return;
    map.invalidateSize();
    if (pts.length === 1) {
      map.setView(pts[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15 });
    }
  }, [map]);

  useEffect(() => {
    const mark = () => { userMoved.current = true; };
    const el = map.getContainer();
    map.on('dragstart', mark);
    el.addEventListener('wheel', mark, { passive: true });
    // The container is often still mid-layout when points first arrive. Refit
    // whenever it changes size, so the first fit isn't computed for a tiny box.
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => { map.off('dragstart', mark); el.removeEventListener('wheel', mark); ro.disconnect(); };
  }, [map, fit]);

  useEffect(() => {
    if (points.length === 0 || points.length <= fittedCount.current) return;
    fittedCount.current = points.length;
    fit();
  }, [points, fit]);
  return null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function MapPage() {
  const [jobs, setJobs] = useState<JobPin[]>([]);
  const [techs, setTechs] = useState<TechLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null);
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [rentals, setRentals] = useState<RentalPin[]>([]);
  const [showRentals, setShowRentals] = useState(() => {
    try { return localStorage.getItem(SHOW_RENTALS_KEY) !== '0'; } catch { return true; }
  });
  const toggleRentals = (on: boolean) => {
    setShowRentals(on);
    try { localStorage.setItem(SHOW_RENTALS_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  };

  // Rentals change rarely, so they load once (and on manual refresh) rather than
  // on the 30s job poll. Workspaces without properties just get an empty list.
  const loadRentals = useCallback(async () => {
    try {
      const res = await api.get('/properties/map');
      setRentals(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRentals([]);
    }
  }, []);
  useEffect(() => { loadRentals(); }, [loadRentals]);

  const load = useCallback(async () => {
    try {
      const params = dateFilter ? `?date=${dateFilter}` : '';
      const [jobsRes, techsRes] = await Promise.all([
        api.get(`/schedule/map-jobs${params}`),
        api.get('/users/locations'),
      ]);
      setJobs(jobsRes.data.data ?? []);
      setTechs(techsRes.data.data ?? []);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    load();
    // Poll jobs every 30s as backup, but real-time tech locations come via socket
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Real-time tech location updates via socket
  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const handler = (data: { userId: string; lat: number; lng: number }) => {
      setTechs(prev => prev.map(t =>
        t.id === data.userId
          ? { ...t, lastLat: data.lat, lastLng: data.lng, lastLocationAt: new Date().toISOString() }
          : t
      ));
    };
    socket.on('technician:location_updated', handler);
    return () => { socket.off('technician:location_updated', handler); };
  }, []);

  const shiftDate = (days: number) => {
    const d = new Date(dateFilter + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDateFilter(d.toISOString().slice(0, 10));
  };

  const filteredJobs = statusFilter ? jobs.filter(j => j.status === statusFilter) : jobs;
  const jobsWithCoords = filteredJobs.filter((j) => j.serviceAddress?.lat && j.serviceAddress?.lng);

  const rentalsWithCoords = showRentals ? rentals.filter((r) => r.lat != null && r.lng != null) : [];

  // All points for initial fit: techs first (most current), then jobs, then rentals
  const allPoints: [number, number][] = [
    ...techs.map((t): [number, number] => [t.lastLat, t.lastLng]),
    ...jobsWithCoords.map((j): [number, number] => [j.serviceAddress!.lat!, j.serviceAddress!.lng!]),
    ...rentalsWithCoords.map((r): [number, number] => [r.lat!, r.lng!]),
  ];

  const center: [number, number] = [33.4484, -112.074]; // Phoenix fallback (only used before data loads)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-gray-900">Live Map</h1>
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => shiftDate(-1)} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="text-xs border rounded px-1.5 py-0.5" />
            <button onClick={() => shiftDate(1)} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
            {dateFilter !== todayStr() && (
              <button onClick={() => setDateFilter(todayStr())} className="text-xs text-indigo-600 font-medium ml-1">Today</button>
            )}
          </div>
          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border rounded px-1.5 py-1">
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500 inline-block" /> Scheduled</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400 inline-block" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Completed</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-indigo-600 inline-block" /> Technician</span>
          </div>
          {rentals.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={showRentals} onChange={(e) => toggleRentals(e.target.checked)} className="h-3.5 w-3.5" />
              <span className="h-3.5 w-3.5 rounded bg-teal-700 inline-flex items-center justify-center"><Home className="h-2.5 w-2.5 text-white" /></span>
              Rentals
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {jobsWithCoords.length} jobs · {techs.length} field staff
            {rentals.length > 0 && ` · ${rentals.filter((r) => r.lat != null).length} rentals`} · updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={() => { load(); loadRentals(); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <MapContainer
          center={center}
          zoom={11}
          style={{ width: '100%', height: '100%', minHeight: '400px' }}
          scrollWheelZoom={true}
        >
          <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} maxZoom={MAP_TILE_MAX_ZOOM} />
          <FitBounds points={allPoints} />

          {/* Rental property markers */}
          {rentalsWithCoords.map((r) => (
            <Marker key={`rental-${r.id}`} position={[r.lat!, r.lng!]} icon={makeRentalIcon(r.occupied, r.openRequests)}>
              <Popup>
                <div className="min-w-[180px]">
                  <p className="font-semibold text-sm">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.address}</p>
                  {r.residents.length > 0 ? (
                    <p className="text-xs text-gray-700 mt-1.5">{r.residents.join(', ')}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1.5">Vacant</p>
                  )}
                  {r.leaseEnd && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Lease ends {new Date(r.leaseEnd).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {r.openRequests > 0 && (
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-medium">
                      {r.openRequests} open request{r.openRequests === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Job markers */}
          {jobsWithCoords.map((job) => (
            <Marker
              key={job.id}
              position={[job.serviceAddress!.lat!, job.serviceAddress!.lng!]}
              icon={makeColorIcon(STATUS_COLORS[job.status] ?? '#6b7280')}
            >
              <Popup>
                <div className="min-w-[160px]">
                  <p className="font-semibold text-sm">{job.title}</p>
                  {job.customer && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {job.customer.firstName} {job.customer.lastName}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {job.serviceAddress!.street}, {job.serviceAddress!.city}
                  </p>
                  {job.scheduledStart && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(job.scheduledStart).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                  <span
                    className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-white text-xs font-medium capitalize"
                    style={{ backgroundColor: STATUS_COLORS[job.status] ?? '#6b7280' }}
                  >
                    {job.status.replace('_', ' ')}
                  </span>
                  {job.technician && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <User className="h-3 w-3" />{job.technician.firstName} {job.technician.lastName}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Tech location markers */}
          {techs.map((tech) => (
            <Marker
              key={tech.id}
              position={[tech.lastLat, tech.lastLng]}
              icon={makeTechIcon(`${tech.firstName[0]}${tech.lastName[0]}`)}
              eventHandlers={{ click: () => setSelectedMember({ id: tech.id, name: `${tech.firstName} ${tech.lastName}` }) }}
            >
              <Popup>
                <div className="min-w-[140px]">
                  <p className="font-semibold text-sm">{tech.firstName} {tech.lastName}</p>
                  <p className="text-xs text-gray-500 capitalize">{tech.role}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Last seen: {new Date(tech.lastLocationAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <button
                    onClick={() => setSelectedMember({ id: tech.id, name: `${tech.firstName} ${tech.lastName}` })}
                    className="mt-2 w-full text-xs text-indigo-600 font-semibold hover:underline text-left"
                  >
                    View today's activity →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {selectedMember && (
        <MemberActivityDrawer
          userId={selectedMember.id}
          name={selectedMember.name}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {showRentals && rentals.some((r) => r.lat == null) && (
        <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-1.5 flex-shrink-0">
          <Home className="h-3.5 w-3.5" />
          {rentals.filter((r) => r.lat == null).length} rental(s) could not be located from their address and are not shown.
        </div>
      )}

      {/* No coords notice */}
      {jobs.length > 0 && jobsWithCoords.length < jobs.length && (
        <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-1.5 flex-shrink-0">
          <MapPin className="h-3.5 w-3.5" />
          {jobs.length - jobsWithCoords.length} job(s) have no geocoded address and are not shown.
        </div>
      )}
    </div>
  );
}
