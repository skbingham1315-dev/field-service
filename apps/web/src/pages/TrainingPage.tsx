import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  BookOpen, Plus, Trash2, Edit2, FileText, Video, Link2,
  ChevronDown, ChevronUp, Sparkles, X, Loader2, Upload,
  Home, GraduationCap, MessageCircle, PenLine, Zap, Grid3X3,
  Users, TrendingUp, CheckCircle2, Clock,
} from 'lucide-react';
import { TrainingHome } from './training/TrainingHome';
import { TrainingLibrary } from './training/TrainingLibrary';
import { TrainingCoach } from './training/TrainingCoach';
import { TrainingExercises } from './training/TrainingExercises';
import { TrainingRolePlay } from './training/TrainingRolePlay';
import { TrainingQuickRef } from './training/TrainingQuickRef';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrainingResource {
  id: string;
  title: string;
  description?: string;
  audience: string;
  targetUserIds: string[];
  fileUrl?: string;
  fileType?: string;
  content?: string;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
}

interface UserProgress {
  sectionsRead: string[];
  exercisesDone: string[];
  rolePlayCount: number;
  currentStreak: number;
}

interface ExerciseAnswer {
  exerciseId: string;
  answer: string;
  aiFeedback?: string;
  status: string;
}

interface RolePlaySession {
  id: string;
  scenario: string;
  difficulty: string;
  debrief?: string;
  rating?: string;
  createdAt: string;
}

// ── Audience helpers ──────────────────────────────────────────────────────────

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone', technician: 'Technicians', sales: 'Sales',
};
const AUDIENCE_COLORS: Record<string, string> = {
  all: 'bg-violet-100 text-violet-700',
  technician: 'bg-amber-100 text-amber-700',
  sales: 'bg-emerald-100 text-emerald-700',
};

function FileIcon({ type }: { type?: string }) {
  if (type === 'video') return <Video className="h-5 w-5 text-blue-500" />;
  if (type === 'link') return <Link2 className="h-5 w-5 text-indigo-500" />;
  return <FileText className="h-5 w-5 text-gray-400" />;
}

// ── Main TrainingPage ─────────────────────────────────────────────────────────

export function TrainingPage() {
  const user = useAuthStore(s => s.user);
  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  const isSales = user?.role === 'sales' || user?.secondaryRoles?.includes('sales');
  const isTech = user?.role === 'technician' || user?.secondaryRoles?.includes('technician');
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>(isOwner ? 'resources' : 'home');

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: resources = [], isLoading: resourcesLoading } = useQuery<TrainingResource[]>({
    queryKey: ['training'],
    queryFn: () => api.get('/training').then(r => r.data.data),
  });

  const { data: progress, refetch: refetchProgress } = useQuery<UserProgress>({
    queryKey: ['training-interactive', 'progress'],
    queryFn: () => api.get('/training-interactive/progress').then(r => r.data.data),
    enabled: !isOwner,
  });

  const { data: exerciseAnswers = [], refetch: refetchAnswers } = useQuery<ExerciseAnswer[]>({
    queryKey: ['training-interactive', 'exercise-answers'],
    queryFn: () => api.get('/training-interactive/exercise-answers').then(r => r.data.data),
    enabled: !isOwner,
  });

  const { data: rolePlaySessions = [], refetch: refetchSessions } = useQuery<RolePlaySession[]>({
    queryKey: ['training-interactive', 'role-play-sessions'],
    queryFn: () => api.get('/training-interactive/role-play-sessions').then(r => r.data.data),
    enabled: !isOwner,
  });

  const { data: teamProgress = [] } = useQuery<Array<{
    user: { id: string; firstName: string; lastName: string; role: string };
    sectionsRead: number;
    exercisesDone: number;
    rolePlayCount: number;
    exercisesReviewed: number;
    currentStreak: number;
    lastActivityAt: string | null;
  }>>({
    queryKey: ['training-interactive', 'team-progress'],
    queryFn: () => api.get('/training-interactive/admin/team-progress').then(r => r.data.data),
    enabled: isOwner,
  });

  // ── Owner view ───────────────────────────────────────────────────────────────
  if (isOwner) {
    return <OwnerTrainingView
      resources={resources}
      resourcesLoading={resourcesLoading}
      teamProgress={teamProgress}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onResourceChanged={() => qc.invalidateQueries({ queryKey: ['training'] })}
    />;
  }

  // ── User tabs ────────────────────────────────────────────────────────────────
  const salesTabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'library', label: 'Library', icon: BookOpen },
    { id: 'practice', label: 'Practice', icon: Zap },
    { id: 'coach', label: 'Coach', icon: MessageCircle },
    { id: 'exercises', label: 'Exercises', icon: PenLine },
    { id: 'quickref', label: 'Quick Ref', icon: Grid3X3 },
    { id: 'resources', label: 'Resources', icon: GraduationCap },
  ];

  const techTabs = [
    { id: 'coach', label: 'AI Coach', icon: MessageCircle },
    { id: 'resources', label: 'Resources', icon: BookOpen },
  ];

  const tabs = isSales ? salesTabs : techTabs;
  if (!isSales && activeTab === 'home') setActiveTab('coach');

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-4 pb-0 border-b border-gray-200 overflow-x-auto flex-shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'home' && isSales && (
          <TrainingHome
            progress={progress ?? null}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'library' && isSales && (
          <TrainingLibrary
            sectionsRead={progress?.sectionsRead ?? []}
            onSectionRead={() => refetchProgress()}
            onPracticeSection={() => setActiveTab('practice')}
          />
        )}

        {activeTab === 'practice' && isSales && (
          <TrainingRolePlay
            sessions={rolePlaySessions}
            onSessionSaved={() => { refetchSessions(); refetchProgress(); }}
          />
        )}

        {activeTab === 'coach' && (
          <TrainingCoach userRole={user?.role ?? 'technician'} />
        )}

        {activeTab === 'exercises' && isSales && (
          <TrainingExercises
            answers={exerciseAnswers}
            onAnswerSaved={(exerciseId, answer, feedback, status) => {
              refetchAnswers();
              refetchProgress();
            }}
          />
        )}

        {activeTab === 'quickref' && isSales && (
          <TrainingQuickRef />
        )}

        {activeTab === 'resources' && (
          <ResourcesTab resources={resources} isLoading={resourcesLoading} isOwner={false} />
        )}
      </div>
    </div>
  );
}

// ── Resources tab (read-only for non-owners) ──────────────────────────────────

function ResourcesTab({ resources, isLoading, isOwner }: { resources: TrainingResource[]; isLoading: boolean; isOwner: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (resources.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>No resources yet.</p>
    </div>
  );
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {resources.map(r => (
        <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-start gap-4 p-5">
            <div className="mt-0.5 flex-shrink-0"><FileIcon type={r.fileType} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900">{r.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${AUDIENCE_COLORS[r.audience] ?? 'bg-gray-100 text-gray-600'}`}>
                  {AUDIENCE_LABELS[r.audience] ?? r.audience}
                </span>
              </div>
              {r.description && <p className="text-sm text-gray-500 mt-1">{r.description}</p>}
              {r.fileUrl && (
                <a href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mt-1 font-medium">
                  <Link2 className="h-3.5 w-3.5" /> Open file / link
                </a>
              )}
            </div>
            {r.content && (
              <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg transition-colors flex-shrink-0">
                {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          {expanded === r.id && r.content && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Owner Training View ───────────────────────────────────────────────────────

function OwnerTrainingView({
  resources, resourcesLoading, teamProgress, activeTab, setActiveTab, onResourceChanged,
}: {
  resources: TrainingResource[];
  resourcesLoading: boolean;
  teamProgress: Array<{ user: { id: string; firstName: string; lastName: string; role: string }; sectionsRead: number; exercisesDone: number; rolePlayCount: number; exercisesReviewed: number; currentStreak: number; lastActivityAt: string | null }>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onResourceChanged: () => void;
}) {
  const qc = useQueryClient();
  const [audienceFilter, setAudienceFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TrainingResource | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resource?')) return;
    await api.delete(`/training/${id}`).catch(() => {});
    onResourceChanged();
  };

  const filtered = audienceFilter ? resources.filter(r => r.audience === audienceFilter) : resources;

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-4 pt-4 pb-0 border-b border-gray-200 flex-shrink-0">
        {[
          { id: 'resources', label: 'Resources', icon: BookOpen },
          { id: 'team', label: 'Team Progress', icon: Users },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Resources tab */}
        {activeTab === 'resources' && (
          <div className="p-2 space-y-5 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-violet-600" /> Training Resources
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">Scripts, guides, and materials for your team</p>
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                <Plus className="h-4 w-4" /> Add Resource
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {['', 'all', 'technician', 'sales'].map(a => (
                <button key={a} onClick={() => setAudienceFilter(a)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    audienceFilter === a ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {a === '' ? 'All' : AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>

            {resourcesLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

            {!resourcesLoading && filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No resources yet. Add your first training material above.</p>
              </div>
            )}

            <div className="space-y-3">
              {filtered.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-start gap-4 p-5">
                    <div className="mt-0.5 flex-shrink-0"><FileIcon type={r.fileType} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${AUDIENCE_COLORS[r.audience] ?? 'bg-gray-100 text-gray-600'}`}>
                          {AUDIENCE_LABELS[r.audience] ?? r.audience}
                        </span>
                        {r.targetUserIds?.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            {r.targetUserIds.length} specific {r.targetUserIds.length === 1 ? 'person' : 'people'}
                          </span>
                        )}
                      </div>
                      {r.description && <p className="text-sm text-gray-500 mt-1">{r.description}</p>}
                      {r.fileUrl && (
                        <a href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mt-1 font-medium">
                          <Link2 className="h-3.5 w-3.5" /> Open file / link
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {r.content && (
                        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg transition-colors">
                          {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      )}
                      <button onClick={() => setEditing(r)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {expanded === r.id && r.content && (
                    <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Progress tab */}
        {activeTab === 'team' && (
          <div className="max-w-3xl mx-auto p-2 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-violet-600" />
              <h2 className="font-bold text-gray-900">Team Training Progress</h2>
            </div>
            {teamProgress.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No training activity yet from your team.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Member</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Exercises</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role Plays</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Streak</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamProgress.map(p => (
                      <tr key={p.user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{p.user.firstName} {p.user.lastName}</p>
                          <p className="text-xs text-gray-400 capitalize">{p.user.role}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${p.sectionsRead > 0 ? 'text-green-600' : 'text-gray-400'}`}>{p.sectionsRead}</span>
                          <span className="text-gray-300">/6</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${p.exercisesReviewed > 0 ? 'text-green-600' : 'text-gray-400'}`}>{p.exercisesReviewed}</span>
                          <span className="text-gray-300">/14</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${p.rolePlayCount > 0 ? 'text-violet-600' : 'text-gray-400'}`}>{p.rolePlayCount}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.currentStreak > 0
                            ? <span className="text-orange-500 font-semibold">🔥 {p.currentStreak}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">
                          {p.lastActivityAt
                            ? new Date(p.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <ResourceModal
          resource={editing ?? undefined}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={() => { setShowCreate(false); setEditing(null); onResourceChanged(); }}
        />
      )}
    </div>
  );
}

// ── Resource create/edit modal ────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL ?? '';

function ResourceModal({ resource, onClose, onSaved }: {
  resource?: TrainingResource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: resource?.title ?? '',
    description: resource?.description ?? '',
    audience: resource?.audience ?? 'all',
    fileUrl: resource?.fileUrl ?? '',
    fileType: resource?.fileType ?? 'pdf',
    content: resource?.content ?? '',
  });
  const [targetUserIds, setTargetUserIds] = useState<string[]>(resource?.targetUserIds ?? []);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const { data: teamData } = useQuery<Array<{ id: string; firstName: string; lastName: string; role: string }>>({
    queryKey: ['users', 'all'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, targetUserIds };
      if (resource) {
        await api.patch(`/training/${resource.id}`, payload);
      } else {
        await api.post('/training', payload);
      }
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('fsp-auth') ? JSON.parse(localStorage.getItem('fsp-auth')!).state?.accessToken : ''}` },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `You are helping create training content for a field service business. ${aiPrompt}\n\nExisting content to tailor:\n${form.content || '(none yet)'}` }],
        }),
      });
      const data = await res.json();
      const text = data?.data?.message ?? data?.choices?.[0]?.message?.content ?? '';
      if (text) setForm(f => ({ ...f, content: text }));
    } catch { /* ignore */ } finally { setAiLoading(false); setAiPrompt(''); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <h2 className="font-bold text-gray-900">{resource ? 'Edit Resource' : 'Add Training Resource'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Title *</label>
            <input type="text" value={form.title} onChange={set('title')} className={inp} placeholder="e.g. HVAC Safety Checklist" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Audience</label>
              <select value={form.audience} onChange={set('audience')} className={inp}>
                <option value="all">Everyone</option>
                <option value="technician">Technicians only</option>
                <option value="sales">Sales only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Type</label>
              <select value={form.fileType} onChange={set('fileType')} className={inp}>
                <option value="pdf">PDF / Document</option>
                <option value="video">Video</option>
                <option value="link">Link</option>
                <option value="script">Sales Script</option>
              </select>
            </div>
          </div>

          {/* Specific people picker */}
          {teamData && teamData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Specific People</label>
                <span className="text-xs text-gray-400">Optional — overrides audience filter</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-2">
                {teamData.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
                    <input type="checkbox"
                      checked={targetUserIds.includes(u.id)}
                      onChange={() => setTargetUserIds(prev =>
                        prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]
                      )}
                      className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-gray-800 truncate">{u.firstName} {u.lastName}</span>
                    <span className="ml-auto text-xs text-gray-400 capitalize">{u.role}</span>
                  </label>
                ))}
              </div>
              {targetUserIds.length > 0 && (
                <p className="text-xs text-violet-600 mt-1">
                  Visible to {targetUserIds.length} specific {targetUserIds.length === 1 ? 'person' : 'people'} (+ owners/admins)
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Description</label>
            <input type="text" value={form.description} onChange={set('description')} className={inp} placeholder="Brief summary" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">File URL or Link</label>
            <input type="url" value={form.fileUrl} onChange={set('fileUrl')} className={inp} placeholder="https://..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Content / Script</label>
              <span className="text-xs text-gray-400">Shown inline when expanded</span>
            </div>
            <textarea value={form.content} onChange={set('content')} rows={8} className={`${inp} resize-y`}
              placeholder="Paste or type training content, sales script, talking points..." />
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
              <Sparkles className="h-4 w-4" /> AI Content Assist
            </div>
            <p className="text-xs text-violet-600">Describe what you want — AI will write or refine the content above.</p>
            <div className="flex gap-2">
              <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAI()}
                className="flex-1 px-3 py-2 border border-violet-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white placeholder-violet-300"
                placeholder='e.g. "Write a 5-step sales script for pool cleaning"' />
              <button onClick={handleAI} disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiLoading ? 'Writing...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-5 border-t flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {resource ? 'Save Changes' : 'Add Resource'}
          </button>
        </div>
      </div>
    </div>
  );
}
