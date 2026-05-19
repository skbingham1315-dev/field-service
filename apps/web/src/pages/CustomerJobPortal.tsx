import { useState } from 'react';
import { MapPin, Clock, Camera, MessageSquare, CheckCircle2, ChevronRight, Lock, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : '/api/v1';

interface JobData {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  serviceAddress: { street: string; city: string; state: string; zip: string };
  customer: { firstName: string; lastName: string };
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
}

interface PortalNote {
  id: string;
  content: string;
  createdAt: string;
  authorRole: string;
}

interface PortalPhoto {
  id: string;
  photoCategory: string | null;
  notes: string | null;
  createdAt: string;
  url: string;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function PortalImage({ url, token, className, alt }: { url: string; token: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState('');
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    fetch(`${API_BASE}${url.replace('/api/v1', '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(b => setSrc(URL.createObjectURL(b)));
  });

  return src
    ? <img src={src} className={`${className} object-cover`} alt={alt ?? ''} onLoad={() => setLoaded(true)} />
    : <div className={`${className} bg-gray-100 animate-pulse`} />;
}

export function CustomerJobPortal() {
  const [jobCode, setJobCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [job, setJob] = useState<JobData | null>(null);
  const [notes, setNotes] = useState<PortalNote[]>([]);
  const [photos, setPhotos] = useState<PortalPhoto[]>([]);
  const [lightbox, setLightbox] = useState<PortalPhoto | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/portal/job-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCode: jobCode.trim(), email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Invalid job code or email.'); return; }

      const { token: t, job: j } = data.data;
      setToken(t);

      // Fetch full job data
      const r2 = await fetch(`${API_BASE}/portal/job/${j.id}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d2 = await r2.json();
      if (r2.ok) {
        setJob(d2.data.job);
        setNotes(d2.data.notes);
        setPhotos(d2.data.photos);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const STATUS_STYLES: Record<string, string> = {
    'Scheduled': 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    'Waiting on Materials': 'bg-orange-100 text-orange-700',
    'Completed': 'bg-green-100 text-green-700',
    'Cancelled': 'bg-gray-100 text-gray-600',
  };

  const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner', admin: 'Office', dispatcher: 'Office', technician: 'Technician', sales: 'Team',
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Track Your Job</h1>
            <p className="text-gray-500 mt-1 text-sm">Enter your job code and email to see progress, photos, and updates.</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Code</label>
              <input
                required
                value={jobCode}
                onChange={e => setJobCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3D4"
                maxLength={8}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Your job code was provided by our team.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>View My Job <ChevronRight className="h-4 w-4" /></>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> Secure · Your information is private
            </p>
          </form>
        </div>
      </div>
    );
  }

  const beforePhotos = photos.filter(p => p.photoCategory === 'before');
  const afterPhotos = photos.filter(p => p.photoCategory === 'after');
  const otherPhotos = photos.filter(p => p.photoCategory !== 'before' && p.photoCategory !== 'after');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-10 pb-6">
        <p className="text-blue-200 text-sm mb-1">Hello, {job.customer.firstName}!</p>
        <h1 className="text-xl font-bold">{job.title}</h1>
        <div className="flex items-center gap-3 mt-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_STYLES[job.status] ?? 'bg-white/20 text-white'}`}>
            {job.status}
          </span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Job details */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Job Details</h2>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-gray-800">{job.serviceAddress.street}</p>
              <p className="text-gray-500">{job.serviceAddress.city}, {job.serviceAddress.state} {job.serviceAddress.zip}</p>
            </div>
          </div>
          {job.scheduledStart && (
            <div className="flex items-start gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-gray-800">{fmtDate(job.scheduledStart)}</p>
                {job.scheduledEnd && <p className="text-gray-500">through {fmtDate(job.scheduledEnd)}</p>}
              </div>
            </div>
          )}
          {job.lineItems.length > 0 && (
            <div className="border-t pt-3 space-y-1">
              {job.lineItems.map((li, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{li.description}</span>
                  <span className="text-gray-500">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(li.unitPrice / 100)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Updates / notes */}
        {notes.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" /> Updates
            </h2>
            {notes.map(n => (
              <div key={n.id} className="border-l-2 border-blue-200 pl-3">
                <p className="text-sm text-gray-800">{n.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {ROLE_LABELS[n.authorRole] ?? 'Team'} · {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-500" /> Progress Photos
            </h2>
            {[
              { label: 'Before', items: beforePhotos },
              { label: 'After', items: afterPhotos },
              { label: 'Progress', items: otherPhotos },
            ].filter(g => g.items.length > 0).map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                <div className="grid grid-cols-3 gap-2">
                  {group.items.map(p => (
                    <button key={p.id} onClick={() => setLightbox(p)} className="aspect-square rounded-xl overflow-hidden">
                      <PortalImage url={p.url} token={token} className="w-full h-full" alt={p.photoCategory ?? ''} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && notes.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400">
            <Camera className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Photos and updates will appear here as work progresses.</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Questions? Call or text our office directly.
        </p>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white"><X className="h-6 w-6" /></button>
          <div className="max-w-sm w-full">
            <PortalImage url={lightbox.url} token={token} className="w-full rounded-xl max-h-[70vh]" />
            {lightbox.notes && <p className="text-white text-sm mt-3 text-center">{lightbox.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
