import { useState, useEffect, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import { api } from '../lib/api';
import { MapPin, User, RefreshCw, AlertCircle } from 'lucide-react';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

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

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  draft: '#6b7280',
  cancelled: '#ef4444',
};

function NoKeyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 gap-4 p-8">
      <AlertCircle className="h-12 w-12 text-amber-500" />
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-800 mb-1">Google Maps API Key Required</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Add your API key to <code className="bg-gray-100 px-1 rounded">apps/web/.env</code>:
        </p>
        <pre className="mt-2 text-xs bg-gray-900 text-green-400 rounded-lg p-3 text-left">
          VITE_GOOGLE_MAPS_API_KEY=your_key_here
        </pre>
        <p className="text-xs text-gray-400 mt-2">Restart the dev server after adding the key.</p>
      </div>
    </div>
  );
}

export function MapPage() {
  const [jobs, setJobs] = useState<JobPin[]>([]);
  const [techs, setTechs] = useState<TechLocation[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobPin | null>(null);
  const [selectedTech, setSelectedTech] = useState<TechLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

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
  const center = jobsWithCoords.length > 0
    ? { lat: jobsWithCoords[0].serviceAddress!.lat!, lng: jobsWithCoords[0].serviceAddress!.lng! }
    : { lat: 33.4484, lng: -112.074 }; // Phoenix default

  if (!MAPS_API_KEY) return <NoKeyPlaceholder />;

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
      <div className="flex-1">
        <APIProvider apiKey={MAPS_API_KEY}>
          <Map
            defaultCenter={center}
            defaultZoom={11}
            mapId="fsp-map"
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            {/* Job markers */}
            {jobsWithCoords.map((job) => (
              <AdvancedMarker
                key={job.id}
                position={{ lat: job.serviceAddress!.lat!, lng: job.serviceAddress!.lng! }}
                onClick={() => { setSelectedJob(job); setSelectedTech(null); }}
              >
                <Pin
                  background={STATUS_COLORS[job.status] ?? '#6b7280'}
                  borderColor="white"
                  glyphColor="white"
                />
              </AdvancedMarker>
            ))}

            {/* Tech/sales location markers */}
            {techs.map((tech) => (
              <AdvancedMarker
                key={tech.id}
                position={{ lat: tech.lastLat, lng: tech.lastLng }}
                onClick={() => { setSelectedTech(tech); setSelectedJob(null); }}
              >
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-indigo-600 border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-bold">
                    {tech.firstName[0]}{tech.lastName[0]}
                  </div>
                  {tech.isAvailable && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border border-white" />
                  )}
                </div>
              </AdvancedMarker>
            ))}

            {/* Job info window */}
            {selectedJob && selectedJob.serviceAddress?.lat && (
              <InfoWindow
                position={{ lat: selectedJob.serviceAddress.lat as number, lng: selectedJob.serviceAddress.lng as number }}
                onCloseClick={() => setSelectedJob(null)}
              >
                <div className="p-1 min-w-[180px]">
                  <p className="font-semibold text-gray-900 text-sm">{selectedJob.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedJob.customer ? `${selectedJob.customer.firstName} ${selectedJob.customer.lastName}` : '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedJob.serviceAddress.street}, {selectedJob.serviceAddress.city}
                  </p>
                  {selectedJob.scheduledStart && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(selectedJob.scheduledStart).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium capitalize"
                      style={{ backgroundColor: STATUS_COLORS[selectedJob.status] ?? '#6b7280' }}
                    >
                      {selectedJob.status.replace('_', ' ')}
                    </span>
                    {selectedJob.technician && (
                      <span className="text-xs text-gray-500 flex items-center gap-0.5">
                        <User className="h-3 w-3" />
                        {selectedJob.technician.firstName}
                      </span>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* Tech info window */}
            {selectedTech && (
              <InfoWindow
                position={{ lat: selectedTech.lastLat, lng: selectedTech.lastLng }}
                onCloseClick={() => setSelectedTech(null)}
              >
                <div className="p-1 min-w-[160px]">
                  <p className="font-semibold text-gray-900 text-sm">{selectedTech.firstName} {selectedTech.lastName}</p>
                  <p className="text-xs text-gray-500 capitalize">{selectedTech.role}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Last seen: {new Date(selectedTech.lastLocationAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <p className={`text-xs mt-1 font-medium ${selectedTech.isAvailable ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {selectedTech.isAvailable ? 'Available' : 'Unavailable'}
                  </p>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* No coords notice */}
      {jobs.length > 0 && jobsWithCoords.length < jobs.length && (
        <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-1.5 flex-shrink-0">
          <MapPin className="h-3.5 w-3.5" />
          {jobs.length - jobsWithCoords.length} job(s) have no geocoded address and are not shown on the map.
        </div>
      )}
    </div>
  );
}
