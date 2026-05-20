import { useState, useEffect } from 'react';
import { MapPin, Clock, Camera, MessageSquare, CheckCircle2, ChevronRight, X, Copy, Check, Phone } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : '/api/v1';

interface JobData {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  serviceAddress: { street: string; city: string; state: string; zip: string };
  customer: { firstName: string; lastName: string; phone?: string };
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
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtTime(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function PortalImage({ url, token, className, alt }: { url: string; token: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}${url.replace('/api/v1', '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(b => setSrc(URL.createObjectURL(b)))
      .catch(() => {});
  }, [url, token]);

  return src
    ? <img src={src} className={`${className} object-cover`} alt={alt ?? ''} />
    : <div className={`${className} bg-gray-800/40 animate-pulse`} />;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:       { label: 'Pending',     color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',      dot: 'bg-gray-400' },
  scheduled:   { label: 'Scheduled',   color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',      dot: 'bg-blue-400' },
  en_route:    { label: 'On the Way',  color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',   dot: 'bg-amber-400 animate-pulse' },
  in_progress: { label: 'In Progress', color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30', dot: 'bg-orange-400 animate-pulse' },
  completed:   { label: 'Completed',   color: 'bg-green-500/20 text-green-300 border border-green-500/30',   dot: 'bg-green-400' },
  on_hold:     { label: 'On Hold',     color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30', dot: 'bg-purple-400' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-500/20 text-red-300 border border-red-500/30',         dot: 'bg-red-400' },
  'In Progress': { label: 'In Progress', color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30', dot: 'bg-orange-400 animate-pulse' },
  'Scheduled':   { label: 'Scheduled',   color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',      dot: 'bg-blue-400' },
  'Completed':   { label: 'Completed',   color: 'bg-green-500/20 text-green-300 border border-green-500/30',   dot: 'bg-green-400' },
};

export function CustomerJobPortal() {
  const [jobCode, setJobCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [job, setJob] = useState<JobData | null>(null);
  const [notes, setNotes] = useState<PortalNote[]>([]);
  const [photos, setPhotos] = useState<PortalPhoto[]>([]);
  const [lightbox, setLightbox] = useState<PortalPhoto | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-fill code from URL ?code= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setJobCode(code.toUpperCase());
      // Auto-submit if code in URL
      autoLogin(code.toUpperCase());
    }
  }, []);

  const autoLogin = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/portal/job-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCode: code }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Invalid job code.'); setLoading(false); return; }
      await loadJob(data.data.token, data.data.job.id);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadJob = async (t: string, jobId: string) => {
    setToken(t);
    const r2 = await fetch(`${API_BASE}/portal/job/${jobId}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const d2 = await r2.json();
    if (r2.ok) {
      setJob(d2.data.job);
      setNotes(d2.data.notes);
      setPhotos(d2.data.photos);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/portal/job-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCode: jobCode.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Invalid job code.'); return; }
      await loadJob(data.data.token, data.data.job.id);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!job) return;
    const code = job.id.slice(-8).toUpperCase();
    const url = `${window.location.origin}/job-portal?code=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Login screen ───────────────────────────────────────────────────────────

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

        {/* Floating orbs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)', filter: 'blur(60px)' }} />
          <div className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)', filter: 'blur(80px)' }} />
        </div>

        <div className="relative w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <CheckCircle2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Track Your Job</h1>
            <p className="text-slate-400 mt-1.5 text-sm">Enter your job code to see real-time progress, photos, and updates.</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Job Code
                </label>
                <input
                  required
                  value={jobCode}
                  onChange={e => setJobCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="A1B2C3D4"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-4 py-3.5 rounded-xl text-center text-2xl font-mono font-bold tracking-[0.3em] uppercase text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                />
                <p className="text-xs text-slate-500 mt-2 text-center">Your 8-character code was shared by our team</p>
              </div>

              {error && (
                <div className="rounded-xl p-3 text-sm text-red-300 text-center"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || jobCode.length < 6}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {loading
                  ? <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><span>View My Job</span><ChevronRight className="h-4 w-4" /></>
                }
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            Powered by FieldOps · Secure access
          </p>
        </div>
      </div>
    );
  }

  // ── Job view ───────────────────────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.scheduled;
  const beforePhotos = photos.filter(p => p.photoCategory === 'before');
  const afterPhotos = photos.filter(p => p.photoCategory === 'after');
  const otherPhotos = photos.filter(p => p.photoCategory !== 'before' && p.photoCategory !== 'after');
  const jobCode8 = job.id.slice(-8).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Hero header */}
      <div className="relative overflow-hidden px-4 pt-12 pb-8"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)', filter: 'blur(60px)' }} />
        </div>
        <div className="relative max-w-lg mx-auto">
          <p className="text-indigo-300 text-sm font-medium mb-1">Hello, {job.customer.firstName}!</p>
          <h1 className="text-2xl font-bold text-white leading-tight mb-3">{job.title}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
            <span className="text-slate-500 text-xs font-mono">#{jobCode8}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-3 pb-12">

        {/* Job details card */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Job Details</h2>
          <div className="space-y-2.5">
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white">{job.serviceAddress.street}</p>
                <p className="text-slate-400 text-xs mt-0.5">{job.serviceAddress.city}, {job.serviceAddress.state} {job.serviceAddress.zip}</p>
              </div>
            </div>
            {job.scheduledStart && (
              <div className="flex items-start gap-3 text-sm">
                <Clock className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white">{fmtDate(job.scheduledStart)}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{fmtTime(job.scheduledStart)}{job.scheduledEnd ? ` – ${fmtTime(job.scheduledEnd)}` : ''}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Updates / notes */}
        {notes.length > 0 && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-indigo-400" /> Updates from Our Team
            </h2>
            <div className="space-y-3">
              {notes.map(n => (
                <div key={n.id} className="flex gap-3">
                  <div className="w-1 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #6366f1, #8b5cf6)' }} />
                  <div>
                    <p className="text-sm text-white leading-relaxed">{n.content}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-indigo-400" /> Progress Photos
            </h2>
            {[
              { label: 'Before', items: beforePhotos },
              { label: 'After', items: afterPhotos },
              { label: 'Progress', items: otherPhotos },
            ].filter(g => g.items.length > 0).map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">{group.label}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.items.map(p => (
                    <button key={p.id} onClick={() => setLightbox(p)}
                      className="aspect-square rounded-xl overflow-hidden hover:opacity-90 transition-opacity">
                      <PortalImage url={p.url} token={token} className="w-full h-full" alt={p.photoCategory ?? ''} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && notes.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Camera className="h-10 w-10 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">Photos and updates will appear here as work progresses.</p>
          </div>
        )}

        {/* Share your link */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wide mb-2">Your Job Link</p>
          <p className="text-xs text-slate-400 mb-3">Share this link to view your job status anytime — no login needed.</p>
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.2)', border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(99,102,241,0.3)', color: copied ? '#86efac' : '#a5b4fc' }}
          >
            {copied ? <><Check className="h-4 w-4" /> Link Copied!</> : <><Copy className="h-4 w-4" /> Copy My Job Link</>}
          </button>
        </div>

        {/* Contact */}
        <p className="text-center text-xs text-slate-600 pt-2 pb-4">
          Questions? Contact our office directly.
        </p>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-5 right-5 text-white/60 hover:text-white">
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <PortalImage url={lightbox.url} token={token} className="w-full rounded-2xl max-h-[75vh]" />
            {lightbox.notes && (
              <p className="text-white/70 text-sm mt-3 text-center">{lightbox.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
