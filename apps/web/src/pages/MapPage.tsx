import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { MemberActivityDrawer } from '../components/MemberActivityDrawer';
import L from 'leaflet';
import { api } from '../lib/api';
import { MapPin, User, RefreshCw } from 'lucide-react';

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

// Recenter map when jobs load
function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

export function MapPage() {
  const [jobs, setJobs] = useState<JobPin[]>([]);
  const [techs, setTechs] = useState<TechLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [jobsRes, techsRes] = await Promise.all([
        api.get('/schedule/map-jobs'),
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
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const jobsWithCoords = jobs.filter((j) => j.serviceAddress?.lat && j.serviceAddress?.lng);
  const center: [number, number] = jobsWithCoords.length > 0
    ? [jobsWithCoords[0].serviceAddress!.lat!, jobsWithCoords[0].serviceAddress!.lng!]
    : [33.4484, -112.074]; // Phoenix default

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-gray-900">Live Map</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500 inline-block" /> Scheduled</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400 inline-block" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Completed</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-indigo-600 inline-block" /> Technician</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {jobsWithCoords.length} jobs · {techs.length} field staff · updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={load}
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
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
          <MapCenter center={center} />

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
