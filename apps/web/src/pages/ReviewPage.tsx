import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Star, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface ReviewData {
  alreadySubmitted: boolean;
  jobTitle?: string;
  serviceType?: string;
  technicianName?: string | null;
  rating?: number | null;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-2 justify-center" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className={`h-12 w-12 transition-colors ${
              star <= (hovered || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent!',
};

export function ReviewPage({ token }: { token: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError } = useQuery<ReviewData>({
    queryKey: ['review', token],
    queryFn: async () => {
      const { data } = await api.get(`/reviews/public/${token}`);
      return data.data;
    },
    retry: false,
  });

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => api.post(`/reviews/public/${token}`, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Link Not Found</h2>
          <p className="text-sm text-gray-500">This review link has expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (data?.alreadySubmitted || submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-500 text-sm">
            {submitted
              ? 'Your review has been submitted. We really appreciate your feedback!'
              : 'This review has already been submitted. Thanks for your feedback!'}
          </p>
          {(data?.rating || rating > 0) && (
            <div className="flex justify-center mt-4 gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-6 w-6 ${s <= (data?.rating ?? rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <Star className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">How did we do?</h1>
          {data?.jobTitle && (
            <p className="text-sm text-gray-500">
              {data.technicianName ? `${data.technicianName} · ` : ''}{data.jobTitle}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-center mt-2 text-sm font-semibold text-blue-600 animate-pulse-once">
                {RATING_LABELS[rating]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Any comments? <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us about your experience..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={() => submit()}
            disabled={rating === 0 || isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            {isPending ? 'Submitting...' : 'Submit Review'}
          </button>

          {rating === 0 && (
            <p className="text-center text-xs text-gray-400">Tap a star to rate your experience</p>
          )}
        </div>
      </div>
    </div>
  );
}
