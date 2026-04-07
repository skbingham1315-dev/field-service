import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import { X, MapPin, Clock, CheckCircle, Briefcase, AlertCircle, BookUser, Users } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  userId: string;
  name: string;
  onClose: () => void;
}

const JOB_STATUS_STYLES: Record<string, { color: string; label: string }> = {
  scheduled:   { color: 'bg-blue-100 text-blue-700',    label: 'Scheduled' },
  en_route:    { color: 'bg-indigo-100 text-indigo-700', label: 'En Route' },
  in_progress: { color: 'bg-amber-100 text-amber-700',  label: 'In Progress' },
  on_hold:     { color: 'bg-gray-100 text-gray-600',    label: 'On Hold' },
  completed:   { color: 'bg-green-100 text-green-700',  label: 'Completed' },
  cancelled:   { color: 'bg-red-100 text-red-600',      label: 'Cancelled' },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function MemberActivityDrawer({ userId, name, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['member-today', userId],
    queryFn: async () => {
      const { data } = await api.get(`/users/${userId}/today`);
      return data.data as {
        member: { firstName: string; lastName: string; role: string; lastLat: number | null; lastLng: number | null; lastLocationAt: string | null };
        jobs: Array<{
          id: string; title: string; status: string; scheduledStart: string | null; actualStart: string | null; actualEnd: string | null;
          customer: { firstName: string; lastName: string; phone?: string } | null;
          serviceAddress: { street: string; city: string; state: string } | null;
        }>;
        locationTrail: Array<{ lat: number; lng: number; recordedAt: string }>;
        contactActivities: Array<{
          id: string; type: string; note: string | null; createdAt: string;
          contact: { fullName: string | null; businessName: string | null; phone: string | null } | null;
        }>;
      };
    },
  });

  const trail = data?.locationTrail ?? [];
  const trailCoords: [number, number][] = trail.map(p => [p.lat, p.lng]);
  const hasTrail = trailCoords.length > 0;
  const mapCenter: [number, number] = hasTrail
    ? trailCoords[trailCoords.length - 1]
    : [33.4484, -112.074];

  const jobs = data?.jobs ?? [];
  const completed = jobs.filter(j => j.status === 'completed').length;
  const contactActivities = data?.contactActivities ?? [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{name}</h2>
            <p className="text-xs text-gray-500 capitalize">{data?.member.role ?? '—'} · Today's Activity</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* Stats strip */}
            <div className="flex gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{jobs.length}</p>
                <p className="text-xs text-gray-500">Jobs</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">{completed}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-indigo-600">{contactActivities.length}</p>
                <p className="text-xs text-gray-500">CRM Edits</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-blue-600">{trail.length > 0 ? trail.length * 5 : 0}</p>
                <p className="text-xs text-gray-500">GPS Pings</p>
              </div>
              {data?.member.lastLocationAt && (
                <div className="text-center ml-auto">
                  <p className="text-xs font-semibold text-gray-700">{fmt(data.member.lastLocationAt)}</p>
                  <p className="text-xs text-gray-500">Last Seen</p>
                </div>
              )}
            </div>

            {/* Location trail map */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Location Trail Today
              </p>
              {!hasTrail ? (
                <div className="h-40 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center text-sm text-gray-400">
                  No GPS data recorded today
                </div>
              ) : (
                <div className="h-48 rounded-xl overflow-hidden border border-gray-200">
                  <MapContainer center={mapCenter} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false} scrollWheelZoom={false}>
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                      subdomains="abcd"
                      attribution=""
                    />
                    {/* Route line */}
                    <Polyline positions={trailCoords} color="#4f46e5" weight={3} opacity={0.8} />
                    {/* Start dot */}
                    <CircleMarker center={trailCoords[0]} radius={6} color="#10b981" fillColor="#10b981" fillOpacity={1} weight={2}>
                      <Tooltip permanent direction="top" offset={[0, -8]}>Start</Tooltip>
                    </CircleMarker>
                    {/* Current position */}
                    <CircleMarker center={trailCoords[trailCoords.length - 1]} radius={8} color="#4f46e5" fillColor="#4f46e5" fillOpacity={1} weight={2}>
                      <Tooltip permanent direction="top" offset={[0, -10]}>Now</Tooltip>
                    </CircleMarker>
                  </MapContainer>
                </div>
              )}
            </div>

            {/* Jobs today */}
            <div className="px-5 pt-3 pb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Jobs Scheduled Today
              </p>

              {jobs.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No jobs scheduled for today
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map(job => {
                    const style = JOB_STATUS_STYLES[job.status] ?? { color: 'bg-gray-100 text-gray-600', label: job.status };
                    return (
                      <div key={job.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 text-sm truncate">{job.title}</p>
                            {job.customer && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {job.customer.firstName} {job.customer.lastName}
                              </p>
                            )}
                            {job.serviceAddress && (
                              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                {job.serviceAddress.street}, {job.serviceAddress.city}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${style.color}`}>
                            {style.label}
                          </span>
                        </div>

                        {/* Time info */}
                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          {job.scheduledStart && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />Scheduled {fmt(job.scheduledStart)}
                            </span>
                          )}
                          {job.actualStart && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Clock className="h-3 w-3" />Started {fmt(job.actualStart)}
                            </span>
                          )}
                          {job.actualEnd && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" />Done {fmt(job.actualEnd)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Contact / CRM activity */}
            <div className="px-5 pt-3 pb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <BookUser className="h-3.5 w-3.5" /> Contact & CRM Activity Today
              </p>

              {contactActivities.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">
                  <Users className="h-7 w-7 mx-auto mb-2 text-gray-300" />
                  No contact edits today
                </div>
              ) : (
                <div className="space-y-2">
                  {contactActivities.map(a => {
                    const contactName = a.contact?.fullName ?? a.contact?.businessName ?? 'Unknown Contact';
                    const typeLabel: Record<string, string> = {
                      status_change: 'Status Changed',
                      note: 'Note Added',
                      call: 'Call Logged',
                      email: 'Email Logged',
                      visit: 'Visit Logged',
                      text: 'Text Logged',
                      estimate_sent: 'Estimate Sent',
                      job_completed: 'Job Completed',
                      follow_up_set: 'Follow-up Set',
                    };
                    return (
                      <div key={a.id} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <BookUser className="h-3.5 w-3.5 text-indigo-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-700">{typeLabel[a.type] ?? a.type}</p>
                            <p className="text-xs text-gray-400 flex-shrink-0">{fmt(a.createdAt)}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{contactName}</p>
                          {a.note && <p className="text-xs text-gray-400 mt-1 italic">"{a.note}"</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  );
}
