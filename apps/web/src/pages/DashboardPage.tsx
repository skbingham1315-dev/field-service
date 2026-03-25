import { useQuery } from '@tanstack/react-query';
import { DollarSign, Briefcase, FileText, Users, TrendingUp, TrendingDown, Star, DoorOpen } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../lib/api';

const fmt = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMonth(raw: string) {
  const [year, month] = raw.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(year).slice(2);
}

function formatMonthAbbr(raw: string) {
  const [year, month] = raw.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-gray-200 animate-pulse rounded-lg ${className ?? ''}`} />;
}

interface OverviewData {
  revenueMtd: number;
  jobsCompleted: number;
  outstandingInvoices: number;
  activeCustomers: number;
  revenueTrend?: number;
  jobsTrend?: number;
}

interface MonthlyRow {
  month: string;
  revenue: number;
  jobs: number;
}

interface TechnicianRow {
  id: string;
  name: string;
  jobsDone: number;
  avgDuration: number;
}

interface JobStatusBreakdown {
  status: string;
  count: number;
}

interface SalesRep {
  userId: string;
  name: string;
  doorsKnocked: number;
  peopleContacted: number;
  estimatesGiven: number;
  leadsAdded: number;
  jobsScheduled: number;
  daysActive: number;
}

interface SalesGoal {
  doorsKnocked: number;
  peopleContacted: number;
  estimatesGiven: number;
  leadsAdded: number;
  jobsScheduled: number;
}

interface ReviewSummary {
  overall: { avgRating: number | null; totalReviews: number };
  byTechnician: Array<{ technicianId: string; name: string; avgRating: number | null; totalReviews: number }>;
}

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${cls} ${s <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500',
  en_route: 'bg-indigo-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  on_hold: 'bg-orange-500',
  cancelled: 'bg-red-500',
};

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  trend,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  trend?: number;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-start justify-between">
      <div className="min-w-0 flex-1">
        {loading ? (
          <>
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
            <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
            {trend !== undefined && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend)}% vs last month
              </p>
            )}
          </>
        )}
      </div>
      <div className={`ml-4 flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center ${iconBg}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ['reports', 'overview'],
    queryFn: async () => {
      const { data } = await api.get('/reports/overview');
      const d = data.data;
      return {
        revenueMtd: d.revenue.mtd,
        jobsCompleted: d.jobs.completed,
        outstandingInvoices: d.invoices.outstanding,
        activeCustomers: d.customers.active,
      };
    },
  });

  const { data: monthly, isLoading: monthlyLoading } = useQuery<MonthlyRow[]>({
    queryKey: ['reports', 'monthly'],
    queryFn: async () => {
      const { data } = await api.get('/reports/monthly');
      return data.data;
    },
  });

  const { data: technicians, isLoading: techLoading } = useQuery<TechnicianRow[]>({
    queryKey: ['reports', 'technicians'],
    queryFn: async () => {
      const { data } = await api.get('/reports/technicians');
      return data.data.map((t: { id: string; firstName: string; lastName: string; jobsCompleted: number; avgDurationMinutes: number }) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        jobsDone: t.jobsCompleted,
        avgDuration: t.avgDurationMinutes,
      }));
    },
  });

  const { data: salesLeaderboard, isLoading: salesLoading } = useQuery<SalesRep[]>({
    queryKey: ['sales', 'leaderboard'],
    queryFn: async () => {
      const { data } = await api.get('/sales/leaderboard');
      return data.data;
    },
  });

  const { data: salesGoals } = useQuery<SalesGoal>({
    queryKey: ['sales-goals'],
    queryFn: async () => {
      const { data } = await api.get('/sales/goals');
      return data.data;
    },
  });

  const { data: reviewSummary, isLoading: reviewsLoading } = useQuery<ReviewSummary>({
    queryKey: ['reviews', 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/reviews/summary');
      return data.data;
    },
  });

  const chartData = (monthly ?? []).map((row) => ({
    name: formatMonthAbbr(row.month),
    label: formatMonth(row.month),
    revenue: row.revenue,
    jobs: row.jobs,
  }));

  const jobStatusBreakdown = (monthly ?? []).reduce<Record<string, number>>((acc, row) => {
    acc['completed'] = (acc['completed'] ?? 0) + row.jobs;
    return acc;
  }, {});

  const statusList: JobStatusBreakdown[] = Object.entries(jobStatusBreakdown).map(([status, count]) => ({
    status,
    count,
  }));

  const totalJobs = statusList.reduce((s, r) => s + r.count, 0);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Revenue MTD"
          value={overview ? fmt(overview.revenueMtd) : '—'}
          icon={DollarSign}
          iconBg="bg-blue-500"
          trend={overview?.revenueTrend}
          loading={overviewLoading}
        />
        <StatCard
          title="Jobs Completed"
          value={overview ? String(overview.jobsCompleted) : '—'}
          icon={Briefcase}
          iconBg="bg-green-500"
          trend={overview?.jobsTrend}
          loading={overviewLoading}
        />
        <StatCard
          title="Outstanding Invoices"
          value={overview ? fmt(overview.outstandingInvoices) : '—'}
          icon={FileText}
          iconBg="bg-orange-500"
          loading={overviewLoading}
        />
        <StatCard
          title="Active Customers"
          value={overview ? String(overview.activeCustomers) : '—'}
          icon={Users}
          iconBg="bg-purple-500"
          loading={overviewLoading}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Monthly Revenue</h2>
        {monthlyLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${Math.round(v / 100 / 1000)}k`}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(value: number) => [fmt(value), 'Revenue']}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload;
                  return row?.label ?? label;
                }}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Recent Jobs — Status Breakdown</h2>
          {monthlyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : statusList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No data available.</p>
          ) : (
            <div className="space-y-3">
              {statusList.map(({ status, count }) => {
                const pct = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0;
                const barColor = STATUS_COLORS[status] ?? 'bg-gray-400';
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                      <span className="text-sm font-semibold text-gray-800">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Technician Performance</h2>
          {techLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !technicians || technicians.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No technician data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium text-gray-500">Name</th>
                    <th className="text-right py-2 pr-4 font-medium text-gray-500">Jobs Done</th>
                    <th className="text-right py-2 font-medium text-gray-500">Avg Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {technicians.map((tech) => (
                    <tr key={tech.id} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{tech.name}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-700">{tech.jobsDone}</td>
                      <td className="py-2.5 text-right text-gray-700">{tech.avgDuration} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sales Team + Customer Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Sales Team — Last 7 Days</h2>
            <DoorOpen className="h-4 w-4 text-gray-400" />
          </div>
          {salesLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !salesLeaderboard || salesLeaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No sales activity logged yet.</p>
          ) : (
            <div className="space-y-3">
              {salesLeaderboard.map((rep, i) => {
                const goal = salesGoals?.doorsKnocked ?? 20;
                const pct = goal > 0 && rep.daysActive > 0 ? Math.min(100, Math.round((rep.doorsKnocked / (goal * rep.daysActive)) * 100)) : 0;
                return (
                  <div key={rep.userId}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-4">#{i + 1}</span>
                        <span className="text-sm font-medium text-gray-800">{rep.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span><strong className="text-gray-800">{rep.doorsKnocked}</strong> doors</span>
                        <span><strong className="text-gray-800">{rep.leadsAdded}</strong> leads</span>
                        <span><strong className="text-gray-800">{rep.jobsScheduled}</strong> booked</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 pt-1">Bar = doors knocked vs daily goal × days active</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Customer Reviews</h2>
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          </div>
          {reviewsLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !reviewSummary || reviewSummary.overall.totalReviews === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No reviews yet. Sent automatically when a tech completes a job.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                <div className="text-3xl font-bold text-yellow-600">
                  {reviewSummary.overall.avgRating?.toFixed(1) ?? '—'}
                </div>
                <div>
                  {reviewSummary.overall.avgRating && <StarDisplay rating={reviewSummary.overall.avgRating} size="md" />}
                  <p className="text-xs text-gray-500 mt-0.5">{reviewSummary.overall.totalReviews} total reviews</p>
                </div>
              </div>
              <div className="space-y-2">
                {reviewSummary.byTechnician
                  .filter(t => t.totalReviews > 0)
                  .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
                  .map((tech) => (
                    <div key={tech.technicianId} className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{tech.name}</p>
                        <p className="text-xs text-gray-400">{tech.totalReviews} review{tech.totalReviews !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {tech.avgRating && <StarDisplay rating={tech.avgRating} />}
                        <span className="text-sm font-bold text-gray-800 w-8 text-right">{tech.avgRating?.toFixed(1) ?? '—'}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
