/**
 * Universal Contractor Review System
 * Tabs: Leaderboard | All Reviews | Moderation Queue
 * Contractor profile panel with star breakdown, category scores, badges
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  Shield,
  Trophy,
  MessageSquare,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  EyeOff,
  Flag,
  Reply,
  X,
  Award,
} from 'lucide-react';
import { Button, Badge } from '@fsp/ui';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  userId: string;
  name: string;
  role: string;
  avatarUrl?: string;
  totalReviews: number;
  avgRating: number | null;
  avgQuality: number | null;
  avgPunctuality: number | null;
  avgCommunication: number | null;
  avgValue: number | null;
  badges: string[];
}

interface ContractorProfile {
  user: { id: string; firstName: string; lastName: string; role: string; avatarUrl?: string; createdAt: string };
  stats: {
    totalReviews: number;
    avgRating: number | null;
    avgQuality: number | null;
    avgPunctuality: number | null;
    avgCommunication: number | null;
    avgValue: number | null;
    ratingDistribution: Array<{ star: number; count: number }>;
  };
  badges: Array<{ id: string; badgeType: string; awardedAt: string }>;
  reviews: Review[];
}

interface Review {
  id: string;
  rating: number | null;
  comment: string | null;
  reviewerName: string | null;
  qualityScore: number | null;
  punctualityScore: number | null;
  communicationScore: number | null;
  valueScore: number | null;
  submittedAt: string | null;
  isFlagged?: boolean;
  isPublic?: boolean;
  response?: { id: string; body: string; createdAt: string } | null;
  job?: { title: string; serviceType: string };
  technician?: { firstName: string; lastName: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Stars({ rating, size = 'sm' }: { rating: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (rating === null) return <span className="text-xs text-slate-400">No rating</span>;
  const sizes = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' };
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sizes[size]} ${i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}`}
        />
      ))}
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score === null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-28">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full"
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-700 w-6">{score.toFixed(1)}</span>
    </div>
  );
}

const BADGE_INFO: Record<string, { icon: string; label: string; color: string }> = {
  top_rated: { icon: '⭐', label: 'Top Rated', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  fast_responder: { icon: '⚡', label: 'Fast Responder', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  perfect_score: { icon: '🏆', label: 'Perfect Score', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  veteran: { icon: '🎖️', label: 'Veteran', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  most_reviewed: { icon: '💬', label: 'Most Reviewed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function BadgePill({ type }: { type: string }) {
  const info = BADGE_INFO[type] ?? { icon: '🏅', label: type, color: 'bg-slate-50 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${info.color}`}>
      {info.icon} {info.label}
    </span>
  );
}

// ─── Contractor Profile Panel ─────────────────────────────────────────────────

function ContractorProfilePanel({ userId, onBack }: { userId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data, isLoading } = useQuery<{ data: ContractorProfile }>({
    queryKey: ['contractor-profile', userId],
    queryFn: () => api.get(`/reviews/profile/${userId}`).then((r) => r.data),
  });

  const addResponse = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.post(`/reviews/${id}/response`, { body }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractor-profile', userId] });
      setReplyingTo(null);
      setReplyText('');
    },
  });

  const flagReview = useMutation({
    mutationFn: (id: string) => api.post(`/reviews/${id}/flag`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contractor-profile', userId] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const profile = data?.data;
  if (!profile) return null;

  const { user, stats, badges, reviews } = profile;
  const totalReviews = stats.ratingDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to Leaderboard
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">{user.firstName} {user.lastName}</h2>
            <p className="text-sm text-slate-500 capitalize">{user.role}</p>
            <div className="flex items-center gap-2 mt-1">
              <Stars rating={stats.avgRating} size="md" />
              {stats.avgRating !== null && (
                <span className="text-sm font-semibold text-slate-700">{stats.avgRating.toFixed(1)}</span>
              )}
              <span className="text-sm text-slate-500">({stats.totalReviews} reviews)</span>
            </div>
          </div>
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            {badges.map((b) => <BadgePill key={b.id} type={b.badgeType} />)}
          </div>
        )}
      </div>

      {/* Category scores + rating distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Category Scores</h3>
          <div className="space-y-2.5">
            <ScoreBar label="Quality" score={stats.avgQuality} />
            <ScoreBar label="Punctuality" score={stats.avgPunctuality} />
            <ScoreBar label="Communication" score={stats.avgCommunication} />
            <ScoreBar label="Value" score={stats.avgValue} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Rating Distribution</h3>
          <div className="space-y-1.5">
            {stats.ratingDistribution.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-6 text-right">{star}★</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: totalReviews ? `${(count / totalReviews) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-6">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800">Reviews ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">
            No reviews yet
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} size="sm" />
                  {r.rating !== null && <span className="text-sm font-semibold text-slate-700">{r.rating}/5</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ''}</span>
                  <button
                    onClick={() => flagReview.mutate(r.id)}
                    className="text-slate-300 hover:text-amber-500 transition-colors"
                    title="Flag for moderation"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {r.reviewerName && <p className="text-xs text-slate-500 mb-1">{r.reviewerName}</p>}
              {r.comment && <p className="text-sm text-slate-700">{r.comment}</p>}

              {/* Category scores */}
              {(r.qualityScore || r.punctualityScore || r.communicationScore || r.valueScore) && (
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-slate-100">
                  {r.qualityScore && <span className="text-xs text-slate-500">Quality: <strong className="text-slate-700">{r.qualityScore}/5</strong></span>}
                  {r.punctualityScore && <span className="text-xs text-slate-500">Punctuality: <strong className="text-slate-700">{r.punctualityScore}/5</strong></span>}
                  {r.communicationScore && <span className="text-xs text-slate-500">Communication: <strong className="text-slate-700">{r.communicationScore}/5</strong></span>}
                  {r.valueScore && <span className="text-xs text-slate-500">Value: <strong className="text-slate-700">{r.valueScore}/5</strong></span>}
                </div>
              )}

              {/* Existing response */}
              {r.response && (
                <div className="mt-3 pl-3 border-l-2 border-blue-300 bg-blue-50 rounded-r-xl px-3 py-2">
                  <p className="text-xs font-semibold text-blue-700 mb-0.5">Owner Response</p>
                  <p className="text-sm text-blue-800">{r.response.body}</p>
                </div>
              )}

              {/* Reply form */}
              {replyingTo === r.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Write a response…"
                    autoFocus
                  />
                  <Button
                    onClick={() => addResponse.mutate({ id: r.id, body: replyText })}
                    disabled={!replyText.trim() || addResponse.isPending}
                    className="h-8 text-xs px-3"
                  >
                    Post
                  </Button>
                  <button onClick={() => setReplyingTo(null)} className="text-slate-400"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                !r.response && (
                  <button
                    onClick={() => setReplyingTo(r.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 mt-2 transition-colors"
                  >
                    <Reply className="h-3.5 w-3.5" /> Respond
                  </button>
                )
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

function LeaderboardTab() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: LeaderboardEntry[] }>({
    queryKey: ['reviews-leaderboard'],
    queryFn: () => api.get('/reviews/leaderboard').then((r) => r.data),
  });

  if (selectedUserId) {
    return <ContractorProfilePanel userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const entries = data?.data ?? [];

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
        <Trophy className="h-7 w-7 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No review data yet. Send review links to customers after jobs are completed.</p>
      </div>
    );
  }

  const MEDALS: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <button
          key={entry.userId}
          onClick={() => setSelectedUserId(entry.userId)}
          className="w-full bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <span className="text-2xl w-8 text-center flex-shrink-0">{MEDALS[i] ?? `#${i + 1}`}</span>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {entry.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{entry.name}</span>
                <span className="text-xs text-slate-500 capitalize">{entry.role}</span>
                {entry.badges.slice(0, 2).map((b) => (
                  <BadgePill key={b} type={b} />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Stars rating={entry.avgRating} size="sm" />
                {entry.avgRating !== null && (
                  <span className="text-sm font-semibold text-slate-700">{entry.avgRating.toFixed(1)}</span>
                )}
                <span className="text-xs text-slate-500">({entry.totalReviews} review{entry.totalReviews !== 1 ? 's' : ''})</span>
              </div>
              {(entry.avgQuality || entry.avgPunctuality || entry.avgCommunication) && (
                <div className="flex gap-3 mt-1">
                  {entry.avgQuality && <span className="text-[10px] text-slate-400">Quality {entry.avgQuality.toFixed(1)}</span>}
                  {entry.avgPunctuality && <span className="text-[10px] text-slate-400">Punctuality {entry.avgPunctuality.toFixed(1)}</span>}
                  {entry.avgCommunication && <span className="text-[10px] text-slate-400">Communication {entry.avgCommunication.toFixed(1)}</span>}
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── All Reviews Tab ──────────────────────────────────────────────────────────

function AllReviewsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: Review[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['all-reviews', page],
    queryFn: () => api.get(`/reviews?page=${page}&limit=20`).then((r) => r.data),
  });

  const togglePublic = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      api.patch(`/reviews/${id}`, { isPublic }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-reviews', page] }),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const reviews = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{meta?.total ?? 0} reviews total</p>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <MessageSquare className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No reviews submitted yet.</p>
        </div>
      ) : (
        <>
          {reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Stars rating={r.rating} size="sm" />
                    {r.technician && (
                      <span className="text-xs text-slate-500">
                        for {r.technician.firstName} {r.technician.lastName}
                      </span>
                    )}
                    {r.job && <span className="text-xs text-slate-400">· {r.job.title}</span>}
                  </div>
                  {r.reviewerName && <p className="text-xs text-slate-500 mb-0.5">{r.reviewerName}</p>}
                  {r.comment && <p className="text-sm text-slate-700">{r.comment}</p>}
                  <p className="text-xs text-slate-400 mt-1">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  {r.isFlagged && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <button
                    onClick={() => togglePublic.mutate({ id: r.id, isPublic: !r.isPublic })}
                    className={`p-1.5 rounded-lg transition-colors ${r.isPublic ? 'text-slate-400 hover:text-slate-700' : 'text-slate-300'}`}
                    title={r.isPublic ? 'Hide review' : 'Show review'}
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {meta && meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
              <span className="flex items-center text-sm text-slate-500">Page {page} of {meta.totalPages}</span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Moderation Queue ─────────────────────────────────────────────────────────

function ModerationTab() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: Review[] }>({
    queryKey: ['reviews-flagged'],
    queryFn: () => api.get('/reviews/flagged').then((r) => r.data),
  });

  const unflag = useMutation({
    mutationFn: (id: string) => api.patch(`/reviews/${id}`, { isFlagged: false }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews-flagged'] }),
  });

  const hide = useMutation({
    mutationFn: (id: string) => api.patch(`/reviews/${id}`, { isPublic: false, isFlagged: false }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews-flagged'] }),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const reviews = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-slate-800">Flagged Reviews ({reviews.length})</h3>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-8 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-emerald-700">No flagged reviews. Queue is clear.</p>
        </div>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-amber-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} size="sm" />
                  {r.technician && (
                    <span className="text-xs text-slate-500">for {r.technician.firstName} {r.technician.lastName}</span>
                  )}
                </div>
                {r.reviewerName && <p className="text-xs text-slate-500 mt-0.5">{r.reviewerName}</p>}
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Flagged</span>
            </div>
            {r.comment && <p className="text-sm text-slate-700 mb-3">{r.comment}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => unflag.mutate(r.id)} disabled={unflag.isPending} className="text-xs h-7 px-3">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Clear Flag
              </Button>
              <Button onClick={() => hide.mutate(r.id)} disabled={hide.isPending} className="text-xs h-7 px-3 bg-slate-700 hover:bg-slate-800">
                <EyeOff className="h-3.5 w-3.5 mr-1" /> Hide Review
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'leaderboard' | 'reviews' | 'moderation';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'reviews', label: 'All Reviews', icon: MessageSquare },
  { id: 'moderation', label: 'Moderation', icon: Shield },
];

export function ReviewsPage() {
  const [tab, setTab] = useState<Tab>('leaderboard');

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Star className="h-5 w-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Contractor Reviews</h1>
            <p className="text-sm text-slate-500">Verified customer reviews, ratings, and performance tracking</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'reviews' && <AllReviewsTab />}
      {tab === 'moderation' && <ModerationTab />}
    </div>
  );
}
