import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
  useDraggable,
  closestCenter,
} from '@dnd-kit/core';
import { format, addDays, subDays } from 'date-fns';
import {
  ChevronLeft, ChevronRight, User, MapPin, Clock,
  Wifi, WifiOff, Circle, RefreshCw, Trash2,
} from 'lucide-react';
import { Badge, Card, CardContent } from '@fsp/ui';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import type { JobStatus } from '@fsp/types';
import { JobDetailModal } from '../components/jobs/JobDetailModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tech {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isAvailable: boolean;
  skills: string[];
  technicianLocations: Array<{ lat: number; lng: number; recordedAt: string }>;
}

interface JobCard {
  id: string;
  title: string;
  status: JobStatus;
  priority: string;
  serviceType: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  estimatedDuration?: number;
  technicianId?: string;
  assignedTechnicians?: Array<{ user: { id: string; firstName: string; lastName: string } }>;
  customer?: { firstName: string; lastName: string; phone?: string };
  serviceAddress?: { street: string; city: string };
}

const STATUS_COLORS: Record<JobStatus, string> = {
  draft: 'bg-gray-100 border-gray-200 text-gray-700',
  scheduled: 'bg-blue-50 border-blue-200 text-blue-800',
  en_route: 'bg-amber-50 border-amber-200 text-amber-800',
  in_progress: 'bg-orange-50 border-orange-200 text-orange-800',
  completed: 'bg-green-50 border-green-200 text-green-800',
  cancelled: 'bg-red-50 border-red-200 text-red-700',
  on_hold: 'bg-purple-50 border-purple-200 text-purple-700',
};

const STATUS_DOT: Record<JobStatus, string> = {
  draft: 'bg-gray-400',
  scheduled: 'bg-blue-500',
  en_route: 'bg-amber-500',
  in_progress: 'bg-orange-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  on_hold: 'bg-purple-500',
};

// ─── Draggable Job Card ───────────────────────────────────────────────────────

function JobCardItem({
  job,
  onClick,
  onDelete,
  isDragging = false,
}: {
  job: JobCard;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}) {
  const colorClass = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft;
  const dotClass = STATUS_DOT[job.status] ?? STATUS_DOT.draft;

  return (
    <div
      className={`
        rounded-lg border p-2.5 text-xs select-none cursor-grab active:cursor-grabbing
        transition-shadow ${isDragging ? 'shadow-2xl ring-2 ring-blue-400 opacity-90 rotate-1' : 'shadow-sm hover:shadow-md'}
        ${colorClass}
      `}
      onClick={onClick}
    >
      <div className="flex items-start gap-1.5">
        <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate leading-tight">{job.title}</p>
          {job.customer && (
            <p className="text-[11px] opacity-75 truncate mt-0.5">
              {job.customer.firstName} {job.customer.lastName}
            </p>
          )}
          {job.assignedTechnicians && job.assignedTechnicians.length > 0 && (
            <p className="text-[11px] opacity-60 truncate flex items-center gap-0.5 mt-0.5">
              <User className="h-2.5 w-2.5 flex-shrink-0" />
              {job.assignedTechnicians.map(a => a.user.firstName).join(', ')}
            </p>
          )}
          {job.serviceAddress && (
            <p className="text-[11px] opacity-60 truncate flex items-center gap-0.5 mt-0.5">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
              {job.serviceAddress.street}
            </p>
          )}
          {job.scheduledStart && (
            <p className="text-[11px] opacity-70 flex items-center gap-0.5 mt-1">
              <Clock className="h-2.5 w-2.5 flex-shrink-0" />
              {format(new Date(job.scheduledStart), 'h:mm a')}
              {job.scheduledEnd && ` – ${format(new Date(job.scheduledEnd), 'h:mm a')}`}
            </p>
          )}
          {job.priority === 'urgent' && (
            <span className="mt-1 inline-block bg-red-200 text-red-800 text-[10px] font-bold px-1 rounded">
              URGENT
            </span>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 opacity-30 hover:opacity-80 hover:text-red-600 rounded transition-opacity flex-shrink-0"
            title="Delete job"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableJobCard({ job, onClick, onDelete }: { job: JobCard; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id, data: { job } });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <JobCardItem job={job} onClick={onClick} onDelete={onDelete} />
    </div>
  );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function TechColumn({
  techId,
  label,
  subtitle,
  isAvailable,
  jobs,
  isOver,
  onJobClick,
  onJobDelete,
}: {
  techId: string;
  label: string;
  subtitle?: string;
  isAvailable?: boolean;
  jobs: JobCard[];
  isOver: boolean;
  onJobClick: (id: string) => void;
  onJobDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: techId });

  const hasCompleted = jobs.filter((j) => j.status === 'completed').length;
  const activeJobs = jobs.filter((j) => j.status !== 'completed');

  return (
    <div className="flex flex-col min-w-[200px] max-w-[240px] flex-shrink-0">
      {/* Column header */}
      <div className={`
        rounded-t-xl px-3 py-2.5 border border-b-0
        ${techId === 'unassigned'
          ? 'bg-gray-700 border-gray-600 text-white'
          : 'bg-gray-800 border-gray-700 text-white'}
      `}>
        <div className="flex items-center gap-2">
          <div className={`
            h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
            ${techId === 'unassigned' ? 'bg-gray-500' : 'bg-blue-500'}
          `}>
            {techId === 'unassigned' ? '?' : label.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{label}</p>
            {subtitle && <p className="text-[10px] text-gray-400 truncate">{subtitle}</p>}
          </div>
          {isAvailable !== undefined && (
            <div className={`ml-auto h-2 w-2 rounded-full flex-shrink-0 ${isAvailable ? 'bg-green-400' : 'bg-gray-500'}`} />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-400">
          <span>{activeJobs.length} active</span>
          {hasCompleted > 0 && <span className="text-green-400">{hasCompleted} done</span>}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 min-h-[480px] rounded-b-xl border p-2 space-y-2 transition-colors
          ${isOver
            ? 'bg-blue-50 border-blue-300 border-dashed border-2'
            : 'bg-gray-50 border-gray-200'}
        `}
      >
        {jobs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-gray-400">
            {isOver ? '✓ Drop here' : 'No jobs'}
          </div>
        ) : (
          jobs.map((job) => (
            <DraggableJobCard key={job.id} job={job} onClick={() => onJobClick(job.id)} onDelete={(e) => onJobDelete(e, job.id)} />
          ))
        )}
        {isOver && jobs.length > 0 && (
          <div className="h-1.5 rounded-full bg-blue-300 animate-pulse mx-2" />
        )}
      </div>
    </div>
  );
}

// ─── Main dispatch board ──────────────────────────────────────────────────────

export function SchedulePage() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeJob, setActiveJob] = useState<JobCard | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const dateStr = format(currentDate, 'yyyy-MM-dd');

  const handleJobDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this job? This cannot be undone.')) return;
    await api.delete(`/jobs/${jobId}`).catch(() => {});
    qc.invalidateQueries({ queryKey: ['schedule'] });
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['schedule', 'board', dateStr],
    queryFn: async () => {
      const { data } = await api.get(`/schedule/board?date=${dateStr}`);
      return data.data as { jobs: JobCard[]; technicians: Tech[] };
    },
  });

  const jobs: JobCard[] = data?.jobs ?? [];
  const technicians: Tech[] = data?.technicians ?? [];

  // ── Real-time socket updates ───────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    connectSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onJobUpdate = () => qc.invalidateQueries({ queryKey: ['schedule', 'board', dateStr] });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('job:assigned', onJobUpdate);
    socket.on('job:updated', onJobUpdate);
    socket.on('job:created', onJobUpdate);

    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('job:assigned', onJobUpdate);
      socket.off('job:updated', onJobUpdate);
      socket.off('job:created', onJobUpdate);
    };
  }, [dateStr, qc]);

  // ── DnD setup ─────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { mutate: assign } = useMutation({
    mutationFn: (payload: { jobId: string; technicianId: string | null }) =>
      api.post('/schedule/assign', payload),
    onMutate: async ({ jobId, technicianId }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ['schedule', 'board', dateStr] });
      const prev = qc.getQueryData<{ data: { jobs: JobCard[]; technicians: Tech[] } }>(['schedule', 'board', dateStr]);
      qc.setQueryData(['schedule', 'board', dateStr], (old: { jobs: JobCard[]; technicians: Tech[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          jobs: old.jobs.map((j) =>
            j.id === jobId ? { ...j, technicianId: technicianId ?? undefined } : j,
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['schedule', 'board', dateStr], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['schedule', 'board', dateStr] });
    },
  });

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveJob(e.active.data.current?.job as JobCard);
  }, []);

  const handleDragOver = useCallback((e: DragOverEvent) => {
    setOverId(e.over?.id as string ?? null);
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveJob(null);
    setOverId(null);
    const { active, over } = e;
    if (!over || !active) return;

    const job = active.data.current?.job as JobCard;
    const targetTechId = over.id as string;

    const newTechId = targetTechId === 'unassigned' ? null : targetTechId;

    if (job.technicianId !== newTechId) {
      assign({ jobId: job.id, technicianId: newTechId });
    }
  }, [assign]);

  // ── Group jobs by tech ─────────────────────────────────────────────────────
  const jobsByTech = useCallback(
    (techId: string) => jobs.filter((j) =>
      j.technicianId === techId ||
      j.assignedTechnicians?.some(a => a.user.id === techId)
    ),
    [jobs],
  );

  const unassignedJobs = jobs.filter((j) => !j.technicianId && !(j.assignedTechnicians?.length));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-white font-bold text-lg">Dispatch Board</h1>

        {/* Date nav */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
          <button
            onClick={() => setCurrentDate(subDays(currentDate, 1))}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-white font-medium text-sm min-w-[140px] text-center">
            {format(currentDate, 'EEEE, MMM d, yyyy')}
          </span>
          <button
            onClick={() => setCurrentDate(addDays(currentDate, 1))}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setCurrentDate(new Date())}
          className="px-3 py-1.5 text-xs text-gray-300 border border-gray-600 rounded-lg hover:border-gray-400 transition-colors"
        >
          Today
        </button>

        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>
            <span className="text-white font-semibold">{jobs.length}</span> jobs
          </span>
          <span>
            <span className="text-amber-400 font-semibold">
              {jobs.filter((j) => ['en_route', 'in_progress'].includes(j.status)).length}
            </span>{' '}
            active
          </span>
          <span>
            <span className="text-green-400 font-semibold">
              {jobs.filter((j) => j.status === 'completed').length}
            </span>{' '}
            done
          </span>
        </div>

        {/* Real-time indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {isConnected ? (
            <><Wifi className="h-3.5 w-3.5 text-green-400" /><span className="text-green-400">Live</span></>
          ) : (
            <><WifiOff className="h-3.5 w-3.5 text-gray-500" /><span className="text-gray-500">Offline</span></>
          )}
        </div>

        <button
          onClick={() => refetch()}
          className="p-1.5 text-gray-400 hover:text-white transition-colors rounded"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Loading board...
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
            <div className="flex gap-3 h-full pb-4" style={{ minWidth: 'max-content' }}>
              {/* Unassigned column */}
              <TechColumn
                techId="unassigned"
                label="Unassigned"
                subtitle={`${unassignedJobs.length} job${unassignedJobs.length !== 1 ? 's' : ''}`}
                jobs={unassignedJobs}
                isOver={overId === 'unassigned'}
                onJobClick={setSelectedJobId}
                onJobDelete={handleJobDelete}
              />

              {/* Divider */}
              <div className="w-px bg-gray-700 self-stretch mx-1 flex-shrink-0" />

              {/* Technician columns */}
              {technicians.length === 0 ? (
                <div className="flex items-center justify-center w-64 text-gray-500 text-sm">
                  No active technicians found.
                  <br />
                  Add technicians in Users.
                </div>
              ) : (
                technicians.map((tech) => (
                  <TechColumn
                    key={tech.id}
                    techId={tech.id}
                    label={`${tech.firstName} ${tech.lastName}`}
                    subtitle={tech.skills.slice(0, 2).join(', ') || undefined}
                    isAvailable={tech.isAvailable}
                    jobs={jobsByTech(tech.id)}
                    isOver={overId === tech.id}
                    onJobClick={setSelectedJobId}
                    onJobDelete={handleJobDelete}
                  />
                ))
              )}
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
            {activeJob && <JobCardItem job={activeJob} isDragging />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 border-t border-gray-700 text-[10px] text-gray-500 flex-shrink-0">
        <span className="text-gray-600">Status:</span>
        {(['scheduled', 'en_route', 'in_progress', 'completed', 'on_hold'] as JobStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
            <span className="capitalize">{s.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex-1" />
        <span>Drag a job card to assign or reassign it to a technician</span>
      </div>

      <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
    </div>
  );
}
