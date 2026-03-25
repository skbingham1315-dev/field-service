import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, MapPin, User, Calendar } from 'lucide-react';
import { Button, Badge, Card, CardContent } from '@fsp/ui';
import { api } from '../lib/api';
import type { JobStatus } from '@fsp/types';
import { CreateJobModal } from '../components/jobs/CreateJobModal';
import { JobDetailModal } from '../components/jobs/JobDetailModal';

const STATUS_COLORS: Record<JobStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  scheduled: 'info',
  en_route: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  on_hold: 'secondary',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft', scheduled: 'Scheduled', en_route: 'En Route',
  in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};

interface JobRow {
  id: string;
  title: string;
  status: JobStatus;
  priority: string;
  serviceType: string;
  scheduledStart?: string;
  customer?: { firstName: string; lastName: string };
  serviceAddress?: { street: string; city: string };
  technician?: { firstName: string; lastName: string };
}

export function JobsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/jobs?${params}`);
      return data;
    },
  });

  const jobs: JobRow[] = (data?.data ?? []).filter((job: JobRow) =>
    search
      ? job.title.toLowerCase().includes(search.toLowerCase()) ||
        `${job.customer?.firstName ?? ''} ${job.customer?.lastName ?? ''}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Job
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs or customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="en_route">En Route</option>
          <option value="in_progress">In Progress</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 mb-3">No jobs found.</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create your first job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(job.id)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{job.title}</span>
                      <Badge variant={STATUS_COLORS[job.status]}>
                        {STATUS_LABELS[job.status]}
                      </Badge>
                      {job.priority === 'urgent' && <Badge variant="destructive">Urgent</Badge>}
                      {job.priority === 'high' && <Badge variant="warning">High</Badge>}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500">
                      {job.customer && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {job.customer.firstName} {job.customer.lastName}
                        </span>
                      )}
                      {job.serviceAddress && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.serviceAddress.street}, {job.serviceAddress.city}
                        </span>
                      )}
                      {job.technician && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <User className="h-3.5 w-3.5" />
                          {job.technician.firstName} {job.technician.lastName}
                        </span>
                      )}
                    </div>
                  </div>

                  {job.scheduledStart && (
                    <div className="text-right text-sm text-gray-400 whitespace-nowrap flex-shrink-0">
                      <div className="flex items-center gap-1 justify-end">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(job.scheduledStart).toLocaleDateString()}
                      </div>
                      <div>
                        {new Date(job.scheduledStart).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateJobModal open={showCreate} onClose={() => setShowCreate(false)} />
      <JobDetailModal jobId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
