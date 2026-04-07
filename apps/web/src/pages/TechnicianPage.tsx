import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Navigation, ChevronDown, ChevronUp, Clock, Phone, DollarSign, LogOut, CheckCircle, Timer, Map } from 'lucide-react';
import { TimeTrackingPage } from './TimeTrackingPage';
import { Badge } from '@fsp/ui';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import { useTenantPermissions } from '../lib/permissions';

const fmt = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type JobStatus = 'scheduled' | 'en_route' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  scheduledStart: string;
  scheduledEnd?: string;
  status: JobStatus;
  serviceType?: string;
  customer?: {
    firstName: string;
    lastName: string;
    phone?: string;
  };
  serviceAddress?: {
    street?: string;
    city?: string;
    state?: string;
  };
  lineItems?: LineItem[];
}

const STATUS_BADGE: Record<JobStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  scheduled: 'info',
  en_route: 'info',
  in_progress: 'warning',
  on_hold: 'secondary',
  completed: 'success',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  en_route: 'En Route',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function JobCard({
  job,
  showPricing,
  showPhone,
  onStatusChange,
  onCompleted,
}: {
  job: Job;
  showPricing: boolean;
  showPhone: boolean;
  onStatusChange: () => void;
  onCompleted: (jobTitle: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: (status: string) => api.patch(`/jobs/${job.id}`, { status }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ['schedule', 'today'] });
      onStatusChange();
      if (status === 'completed') onCompleted(job.title);
    },
  });

  const addressStr = job.serviceAddress
    ? [job.serviceAddress.street, job.serviceAddress.city, job.serviceAddress.state].filter(Boolean).join(', ')
    : null;

  const jobTotal = job.lineItems?.reduce((sum, i) => sum + i.total, 0) ?? 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        className="w-full text-left p-4 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant={STATUS_BADGE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
            {job.serviceType && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{job.serviceType}</span>
            )}
            {showPricing && jobTotal > 0 && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                <DollarSign className="h-3 w-3" />{fmt(jobTotal).replace('$', '')}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-base leading-snug">{job.title}</p>
          {job.customer && (
            <p className="text-sm text-gray-600 mt-0.5">
              {job.customer.firstName} {job.customer.lastName}
            </p>
          )}
          {addressStr && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              {addressStr}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            {formatTime(job.scheduledStart)}
          </p>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
          {job.description && (
            <p className="text-sm text-gray-700">{job.description}</p>
          )}

          {/* Contact — only if permitted */}
          {showPhone && job.customer?.phone && (
            <a
              href={`tel:${job.customer.phone}`}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <Phone className="h-4 w-4" />
              {job.customer.phone}
            </a>
          )}

          {/* Pricing — only if permitted */}
          {showPricing && job.lineItems && job.lineItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job Details</p>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {job.lineItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 truncate">{item.description}</p>
                      <p className="text-xs text-gray-400">Qty {item.quantity} × {fmt(item.unitPrice)}</p>
                    </div>
                    <p className="ml-3 font-semibold text-gray-900 flex-shrink-0">{fmt(item.total)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-bold text-gray-900">
                  <span>Total</span>
                  <span>{fmt(jobTotal)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {job.status === 'scheduled' && (
              <button
                disabled={isPending}
                onClick={() => updateStatus('en_route')}
                className="flex-1 min-w-[120px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
              >
                En Route
              </button>
            )}
            {job.status === 'en_route' && (
              <button
                disabled={isPending}
                onClick={() => updateStatus('in_progress')}
                className="flex-1 min-w-[120px] bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
              >
                Start Job
              </button>
            )}
            {job.status === 'in_progress' && (
              <>
                <button
                  disabled={isPending}
                  onClick={() => updateStatus('completed')}
                  className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
                >
                  Complete
                </button>
                <button
                  disabled={isPending}
                  onClick={() => updateStatus('on_hold')}
                  className="flex-1 min-w-[120px] bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
                >
                  On Hold
                </button>
              </>
            )}
            {job.status === 'on_hold' && (
              <button
                disabled={isPending}
                onClick={() => updateStatus('in_progress')}
                className="flex-1 min-w-[120px] bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
              >
                Resume
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TechnicianPage() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'map' | 'time'>('jobs');
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(false);
  const watchRef = useRef<number | null>(null);
  const [completedToast, setCompletedToast] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['schedule', 'today'],
    queryFn: async () => {
      const params = new URLSearchParams({ date: today });
      if (user?.id) params.set('technicianId', user.id);
      const { data } = await api.get(`/schedule?${params}`);
      return data;
    },
  });

  const { data: meData } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/users/me');
      return data;
    },
  });

  const { data: permissions } = useTenantPermissions();

  const { mutate: toggleAvailability } = useMutation({
    mutationFn: (isAvailable: boolean) => api.patch('/users/me', { isAvailable }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });

  const startTracking = () => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        getSocket().emit('technician:location', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
        });
      },
      undefined,
      { enableHighAccuracy: true },
    );
    setTracking(true);
  };

  const stopTracking = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    setTracking(false);
  };

  const jobs: Job[] = (scheduleData?.data ?? scheduleData ?? []).sort(
    (a: Job, b: Job) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime(),
  );

  const isAvailable = meData?.data?.isAvailable ?? false;
  const showPricing = permissions?.technician.showJobPricing ?? false;
  const showPhone = permissions?.technician.viewCustomerPhone ?? true;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-lg font-bold text-gray-900">My Jobs</h1>
              <p className="text-xs text-gray-500">{todayLabel}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleAvailability(!isAvailable)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  isAvailable ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    isAvailable ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <button onClick={logout} className="text-gray-400 hover:text-gray-600 p-1">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isAvailable ? 'text-green-600' : 'text-gray-400'}`}>
              {isAvailable ? 'Available' : 'Unavailable'}
            </span>
            <div className="flex-1" />
            <button
              onClick={tracking ? stopTracking : startTracking}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tracking
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Navigation className="h-4 w-4" />
              {tracking ? 'Stop GPS' : 'Start GPS'}
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex border-t border-gray-100">
          {([['jobs', 'Jobs', CheckCircle], ['map', 'Map', Map], ['time', 'Time', Timer]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'time' && <TimeTrackingPage />}

      {activeTab === 'map' && (
        <div className="flex flex-col gap-3 px-4 py-4 max-w-2xl mx-auto w-full">
          {jobs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No jobs to show on map.</div>
          ) : (
            jobs.map((job) => {
              const addr = job.serviceAddress
                ? [job.serviceAddress.street, job.serviceAddress.city, job.serviceAddress.state].filter(Boolean).join(', ')
                : null;
              if (!addr) return null;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
              const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(addr)}`;
              return (
                <div key={job.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{job.title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 flex-shrink-0" />{addr}
                      </p>
                    </div>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold whitespace-nowrap hover:bg-blue-700 flex-shrink-0"
                    >
                      <Navigation className="h-3.5 w-3.5" />Navigate
                    </a>
                  </div>
                  <iframe
                    title={job.title}
                    src={embedUrl}
                    width="100%"
                    height="200"
                    style={{ border: 0, display: 'block' }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'jobs' && completedToast && (
        <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2 animate-pulse-once">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-800">Job Complete!</p>
            <p className="text-xs text-green-600 mt-0.5">Review request sent to customer for <span className="font-medium">{completedToast}</span>.</p>
          </div>
        </div>
      )}

      {activeTab === 'jobs' && <main className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl h-24 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 font-medium">No jobs scheduled for today.</p>
            <p className="text-sm text-gray-400 mt-1">Check back later or contact your dispatcher.</p>
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              showPricing={showPricing}
              showPhone={showPhone}
              onStatusChange={() => {}}
              onCompleted={(title) => {
                setCompletedToast(title);
                setTimeout(() => setCompletedToast(null), 5000);
              }}
            />
          ))
        )}
      </main>}
    </div>
  );
}
