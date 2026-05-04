import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera, MessageSquare, User, MapPin, Clock,
  CheckCircle2, PlayCircle, Navigation, XCircle, Upload, Lock, Unlock, Edit2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Badge, Textarea, Select, Input,
} from '@fsp/ui';
import { api } from '../../lib/api';
import type { JobStatus } from '@fsp/types';

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const STATUS_COLORS: Record<JobStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary', scheduled: 'info', en_route: 'warning',
  in_progress: 'warning', completed: 'success', cancelled: 'destructive', on_hold: 'secondary',
};

const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['en_route', 'on_hold', 'cancelled'],
  en_route: ['in_progress', 'on_hold'],
  in_progress: ['completed', 'on_hold'],
  on_hold: ['scheduled', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft', scheduled: 'Scheduled', en_route: 'En Route',
  in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};

interface Props {
  jobId: string | null;
  onClose: () => void;
}

type TabType = 'details' | 'edit' | 'photos' | 'notes';

export function JobDetailModal({ jobId, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabType>('details');
  const [noteText, setNoteText] = useState('');
  const [noteInternal, setNoteInternal] = useState(false);
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'issue' | 'other'>('before');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState<{
    title: string; description: string; priority: string; serviceType: string;
    scheduledStart: string; scheduledEnd: string; technicianIds: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/jobs/${jobId}`);
      return data.data;
    },
    enabled: !!jobId,
    refetchInterval: tab === 'photos' ? 5000 : false,
  });

  const job = data as {
    id: string;
    title: string;
    description?: string;
    status: JobStatus;
    priority: string;
    serviceType: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    actualStart?: string;
    actualEnd?: string;
    customer: { firstName: string; lastName: string; phone?: string; email?: string };
    serviceAddress: { street: string; city: string; state: string; zip: string };
    technician?: { firstName: string; lastName: string; phone?: string };
    assignedTechnicians: Array<{ userId: string; user: { id: string; firstName: string; lastName: string } }>;
    lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
    photos: Array<{ id: string; url: string; type: string; caption?: string; takenAt: string }>;
    notes: Array<{ id: string; content: string; isInternal: boolean; createdAt: string; author: { firstName: string; lastName: string } }>;
  } | undefined;

  const { data: techData } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => { const { data } = await api.get('/users?hasRole=technician'); return data; },
    enabled: !!jobId,
  });
  const allTechs: Array<{ id: string; firstName: string; lastName: string }> = techData?.data ?? [];

  const { mutate: updateStatus, isPending: isUpdatingStatus } = useMutation({
    mutationFn: (status: JobStatus) => api.patch(`/jobs/${jobId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const { mutate: saveEdit, isPending: isSavingEdit } = useMutation({
    mutationFn: (form: NonNullable<typeof editForm>) => api.patch(`/jobs/${jobId}`, {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      serviceType: form.serviceType,
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : null,
      scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : null,
      technicianId: form.technicianIds[0] || null,
      technicianIds: form.technicianIds.length > 0 ? form.technicianIds : [],
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setTab('details'); },
  });

  const { mutate: addNote, isPending: isAddingNote } = useMutation({
    mutationFn: () =>
      api.post(`/jobs/${jobId}/notes`, { content: noteText, isInternal: noteInternal }),
    onSuccess: () => {
      setNoteText('');
      qc.invalidateQueries({ queryKey: ['jobs', jobId] });
    },
  });

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      // Get presigned URL
      const { data: presignData } = await api.post('/uploads/presign', {
        jobId: job!.id,
        type: photoType,
        contentType: file.type,
        filename: file.name,
      });
      const { presignedUrl, key, publicUrl } = presignData.data;

      // Upload directly to S3
      await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Confirm in DB
      await api.post('/uploads/confirm', {
        jobId: job!.id,
        s3Key: key,
        type: photoType,
      });

      qc.invalidateQueries({ queryKey: ['jobs', jobId] });
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  const transitions = job ? STATUS_TRANSITIONS[job.status] : [];

  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl">{job?.title ?? '...'}</DialogTitle>
              {job && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={STATUS_COLORS[job.status]}>{STATUS_LABELS[job.status]}</Badge>
                  {job.priority === 'urgent' && <Badge variant="destructive">Urgent</Badge>}
                  {job.priority === 'high' && <Badge variant="warning">High Priority</Badge>}
                  <span className="text-xs text-gray-500 capitalize">{job.serviceType.replace('_', ' ')}</span>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading && <div className="py-12 text-center text-muted-foreground">Loading...</div>}

        {job && (
          <div className="space-y-4">
            {/* Status actions */}
            {transitions.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600 self-center mr-1">Move to:</span>
                {transitions.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === 'cancelled' ? 'ghost' : s === 'completed' ? 'default' : 'outline'}
                    className={s === 'cancelled' ? 'text-destructive hover:text-destructive' : ''}
                    loading={isUpdatingStatus}
                    onClick={() => updateStatus(s)}
                  >
                    {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b">
              {(['details', 'edit', 'photos', 'notes'] as TabType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    if (t === 'edit' && job && !editForm) {
                      const toLocal = (iso?: string) => iso
                        ? new Date(iso).toLocaleString('sv').slice(0, 16)
                        : '';
                      setEditForm({
                        title: job.title,
                        description: job.description ?? '',
                        priority: job.priority,
                        serviceType: job.serviceType,
                        scheduledStart: toLocal(job.scheduledStart),
                        scheduledEnd: toLocal(job.scheduledEnd),
                        technicianIds: job.assignedTechnicians?.map(a => a.user.id) ?? (job.technician ? [] : []),
                      });
                    }
                    setTab(t);
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors flex items-center gap-1 ${
                    tab === t
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'edit' && <Edit2 className="h-3 w-3" />}
                  {t === 'edit' ? 'Edit' : t}
                  {t === 'photos' && job.photos.length > 0 && (
                    <span className="ml-1.5 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5 py-0.5">
                      {job.photos.length}
                    </span>
                  )}
                  {t === 'notes' && job.notes.length > 0 && (
                    <span className="ml-1.5 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5 py-0.5">
                      {job.notes.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Details tab ── */}
            {tab === 'details' && (
              <div className="space-y-4">
                {/* Key info grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Customer
                      </p>
                      <p className="font-medium">{job.customer.firstName} {job.customer.lastName}</p>
                      {job.customer.phone && <p className="text-gray-600">{job.customer.phone}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Service Address
                      </p>
                      <p className="font-medium">{job.serviceAddress.street}</p>
                      <p className="text-gray-600">{job.serviceAddress.city}, {job.serviceAddress.state} {job.serviceAddress.zip}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Technician
                      </p>
                      {job.technician ? (
                        <>
                          <p className="font-medium">{job.technician.firstName} {job.technician.lastName}</p>
                          {job.technician.phone && <p className="text-gray-600">{job.technician.phone}</p>}
                        </>
                      ) : (
                        <p className="text-gray-400 italic">Unassigned</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Schedule
                      </p>
                      <p className="font-medium">{formatDate(job.scheduledStart)}</p>
                      {job.scheduledEnd && (
                        <p className="text-gray-600">to {formatDate(job.scheduledEnd)}</p>
                      )}
                    </div>
                  </div>
                </div>

                {job.description && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    <p className="text-gray-800">{job.description}</p>
                  </div>
                )}

                {/* Line items */}
                {job.lineItems.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Services / Line Items</p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600 w-12">Qty</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {job.lineItems.map((li) => (
                            <tr key={li.id}>
                              <td className="px-3 py-2">{li.description}</td>
                              <td className="px-3 py-2 text-right">{li.quantity}</td>
                              <td className="px-3 py-2 text-right">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(li.unitPrice / 100)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Edit tab ── */}
            {tab === 'edit' && editForm && (
              <div className="space-y-4">
                <Input
                  label="Job Title *"
                  value={editForm.title}
                  onChange={e => setEditForm(f => f && ({ ...f, title: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Service Type" value={editForm.serviceType}
                    onChange={e => setEditForm(f => f && ({ ...f, serviceType: e.target.value }))}>
                    <option value="pool">Pool</option>
                    <option value="pest_control">Pest Control</option>
                    <option value="turf">Turf</option>
                    <option value="handyman">Handyman</option>
                  </Select>
                  <Select label="Priority" value={editForm.priority}
                    onChange={e => setEditForm(f => f && ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                  <Input label="Scheduled Start" type="datetime-local" value={editForm.scheduledStart}
                    onChange={e => setEditForm(f => f && ({ ...f, scheduledStart: e.target.value }))} />
                  <Input label="Scheduled End" type="datetime-local" value={editForm.scheduledEnd}
                    onChange={e => setEditForm(f => f && ({ ...f, scheduledEnd: e.target.value }))} />
                </div>
                <Textarea label="Description" rows={3} value={editForm.description}
                  onChange={e => setEditForm(f => f && ({ ...f, description: e.target.value }))} />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1.5">Assigned Technicians</p>
                  {allTechs.length === 0 ? (
                    <p className="text-sm text-gray-400">No technicians available</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {allTechs.map(t => (
                        <label key={t.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <input type="checkbox"
                            checked={editForm.technicianIds.includes(t.id)}
                            onChange={() => setEditForm(f => {
                              if (!f) return f;
                              const ids = f.technicianIds.includes(t.id)
                                ? f.technicianIds.filter(x => x !== t.id)
                                : [...f.technicianIds, t.id];
                              return { ...f, technicianIds: ids };
                            })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-800">{t.firstName} {t.lastName}</span>
                          {editForm.technicianIds[0] === t.id && (
                            <span className="ml-auto text-xs text-blue-600 font-medium">Lead</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setTab('details')}>Cancel</Button>
                  <Button className="flex-1" loading={isSavingEdit}
                    disabled={!editForm.title.trim()}
                    onClick={() => saveEdit(editForm)}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {/* ── Photos tab ── */}
            {tab === 'photos' && (
              <div className="space-y-4">
                {/* Upload controls */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <select
                    value={photoType}
                    onChange={(e) => setPhotoType(e.target.value as typeof photoType)}
                    className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="before">Before</option>
                    <option value="after">After</option>
                    <option value="issue">Issue / Problem</option>
                    <option value="other">Other</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    Upload Photo
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <p className="text-xs text-gray-400 ml-auto">Select type, then upload</p>
                </div>

                {/* Photo grid */}
                {job.photos.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Camera className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No photos yet. Upload before &amp; after shots.</p>
                  </div>
                ) : (
                  <>
                    {(['before', 'after', 'issue', 'other'] as const).map((type) => {
                      const typePhotos = job.photos.filter((p) => p.type === type);
                      if (typePhotos.length === 0) return null;
                      return (
                        <div key={type}>
                          <p className="text-sm font-medium text-gray-700 capitalize mb-2">{type}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {typePhotos.map((photo) => (
                              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer">
                                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity">
                                  <img
                                    src={photo.url}
                                    alt={photo.caption ?? type}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // S3 placeholder — show broken image gracefully
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                                {photo.caption && (
                                  <p className="text-xs text-gray-500 mt-0.5 truncate">{photo.caption}</p>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ── Notes tab ── */}
            {tab === 'notes' && (
              <div className="space-y-4">
                {/* Add note */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a note or technician comment..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noteInternal}
                        onChange={(e) => setNoteInternal(e.target.checked)}
                        className="rounded"
                      />
                      {noteInternal ? (
                        <span className="flex items-center gap-1 text-amber-700">
                          <Lock className="h-3.5 w-3.5" /> Internal only
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Unlock className="h-3.5 w-3.5" /> Visible to customer
                        </span>
                      )}
                    </label>
                    <Button
                      size="sm"
                      onClick={() => noteText.trim() && addNote()}
                      loading={isAddingNote}
                      disabled={!noteText.trim()}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Add Note
                    </Button>
                  </div>
                </div>

                {/* Note history */}
                {job.notes.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No notes yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...job.notes].reverse().map((note) => (
                      <div
                        key={note.id}
                        className={`p-3 rounded-lg text-sm ${
                          note.isInternal
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-medium text-gray-900">
                            {note.author.firstName} {note.author.lastName}
                          </span>
                          {note.isInternal && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-700">
                              <Lock className="h-3 w-3" /> Internal
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(note.createdAt).toLocaleString('en-US', {
                              month: 'short', day: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
