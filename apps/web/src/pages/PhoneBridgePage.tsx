import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Plus, Power, PowerOff, Copy, CheckCircle, RefreshCw, MessageSquare, Phone, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const API = import.meta.env.VITE_API_URL || '';

function api(path: string, opts?: RequestInit) {
  const token = useAuthStore.getState().accessToken;
  return fetch(`${API}/api/v1/phone-bridge${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(r => r.json());
}

type Device = { id: string; deviceName: string; deviceModel: string | null; isActive: boolean; lastSeenAt: string | null; createdAt: string; token?: string };
type Thread = { id: string; phoneNumber: string; displayName: string | null; lastMessageAt: string | null; lastMessagePreview: string | null; unreadCount: number; isKnown: boolean; customer: { firstName: string; lastName: string } | null };

export function PhoneBridgePage() {
  const [tab, setTab] = useState<'devices' | 'threads' | 'config'>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadDevices = useCallback(async () => {
    const res = await api('/devices');
    if (res.success) setDevices(res.data);
  }, []);

  const loadThreads = useCallback(async () => {
    const res = await api('/threads');
    if (res.success) setThreads(res.data);
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const registerDevice = async () => {
    setLoading(true);
    const res = await api('/devices/register', {
      method: 'POST',
      body: JSON.stringify({ deviceName: 'Galaxy S24', deviceModel: 'SM-S924B' }),
    });
    if (res.success) {
      setNewToken(res.data.token);
      loadDevices();
    }
    setLoading(false);
  };

  const toggleDevice = async (id: string, isActive: boolean) => {
    await api(`/devices/${id}/${isActive ? 'revoke' : 'activate'}`, { method: 'POST' });
    loadDevices();
  };

  const copyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-violet-500" />
            Phone Bridge
          </h1>
          <p className="text-sm text-gray-500 mt-1">Connect your business phone to FieldOps</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'devices' as const, label: 'Devices', icon: Smartphone },
          { id: 'threads' as const, label: 'Messages', icon: MessageSquare },
          { id: 'config' as const, label: 'Settings', icon: Clock },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); if (t.id === 'threads') loadThreads(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* New token banner */}
      {newToken && (
        <div className="mb-6 bg-violet-50 border border-violet-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-violet-900 mb-2">Device Token (copy this now — it won't be shown again)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-violet-200 rounded-lg px-3 py-2 text-xs font-mono text-violet-800 break-all select-all">
              {newToken}
            </code>
            <button onClick={copyToken} className="flex items-center gap-1 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">
              {copied ? <><CheckCircle className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-violet-600 mt-2">Paste this token in the BD Phone Bridge app on your Galaxy S24</p>
        </div>
      )}

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Registered Devices</h2>
            <button
              onClick={registerDevice}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Register Device
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Smartphone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No devices registered</h3>
              <p className="text-sm text-gray-500 mb-4">Register your Galaxy S24 to start capturing texts and calls</p>
              <button onClick={registerDevice} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
                Register Device
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${d.isActive ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Smartphone className={`h-5 w-5 ${d.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{d.deviceName}</p>
                      <p className="text-xs text-gray-500">
                        {d.deviceModel && `${d.deviceModel} · `}
                        {d.isActive ? (
                          d.lastSeenAt ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}` : 'Active — waiting for first sync'
                        ) : 'Revoked'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {d.isActive ? 'Active' : 'Revoked'}
                    </span>
                    <button
                      onClick={() => toggleDevice(d.id, d.isActive)}
                      className={`p-2 rounded-lg transition-colors ${d.isActive ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                      title={d.isActive ? 'Revoke' : 'Reactivate'}
                    >
                      {d.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Threads Tab */}
      {tab === 'threads' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Message Threads</h2>
            <button onClick={loadThreads} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {threads.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
              <p className="text-sm text-gray-500">Messages will appear here once the phone app starts capturing</p>
            </div>
          ) : (
            <div className="space-y-2">
              {threads.map(t => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-violet-200 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${t.isKnown ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                      {(t.displayName || t.phoneNumber).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {t.displayName || t.phoneNumber}
                        {t.customer && <span className="text-xs text-violet-600 ml-2">({t.customer.firstName} {t.customer.lastName})</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-md">{t.lastMessagePreview || 'No messages'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {t.unreadCount > 0 && (
                      <span className="bg-violet-600 text-white text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
                        {t.unreadCount}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Config Tab */}
      {tab === 'config' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Phone Bridge Settings</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Business Hours</h3>
              <p className="text-sm text-gray-500">Monday - Friday, 9:00 AM - 5:00 PM (America/Phoenix)</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Missed Call Auto-Reply</h3>
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 italic">
                "On a job site, I'll call you back within 2 hours. For estimates, text the address and a few photos."
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">After-Hours Auto-Reply</h3>
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 italic">
                "Thanks for contacting Blue Dingo Construction & Remodel. Our office hours are Monday through Friday, 9 AM to 5 PM. We're out of the office right now and will get back to you the next business day."
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">MCP Server URL</h3>
              <p className="text-xs text-gray-500 mb-1">Add this as a Claude custom connector:</p>
              <code className="text-xs bg-gray-50 border rounded-lg px-3 py-2 block font-mono text-gray-700 select-all">
                {window.location.origin}/mcp
              </code>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">APK Download</h3>
              <p className="text-xs text-gray-500 mb-1">Install on your Galaxy S24:</p>
              <a
                href="https://github.com/skbingham1315-dev/field-service/releases/tag/phone-bridge-v1.0.0"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-600 hover:text-violet-700 font-medium underline"
              >
                Download BD-PhoneBridge.apk from GitHub Releases
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
