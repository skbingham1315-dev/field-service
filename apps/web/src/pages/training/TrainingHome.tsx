import { BookOpen, Zap, MessageCircle, PenLine, Star, Flame, CheckCircle2, TrendingUp } from 'lucide-react';
import { SECTIONS, EXERCISES, DAILY_TIPS } from './trainingContent';

interface Props {
  progress: { sectionsRead: string[]; exercisesDone: string[]; rolePlayCount: number; currentStreak: number } | null;
  onNavigate: (tab: string) => void;
}

const todayTip = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length];

export function TrainingHome({ progress, onNavigate }: Props) {
  const sectionsRead = progress?.sectionsRead ?? [];
  const exercisesDone = progress?.exercisesDone ?? [];
  const rolePlayCount = progress?.rolePlayCount ?? 0;
  const streak = progress?.currentStreak ?? 0;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Progress summary */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">Your Training Progress</h2>
            <p className="text-violet-200 text-sm">Keep the streak alive 🔥</p>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2">
              <Flame className="h-5 w-5 text-orange-300" />
              <span className="font-bold text-lg">{streak}</span>
              <span className="text-xs text-violet-200">day streak</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Sections', value: sectionsRead.length, total: SECTIONS.length },
            { label: 'Exercises', value: exercisesDone.length, total: EXERCISES.length },
            { label: 'Role Plays', value: rolePlayCount, total: null },
          ].map(({ label, value, total }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{value}{total ? <span className="text-sm font-normal text-violet-300">/{total}</span> : ''}</p>
              <p className="text-xs text-violet-200 mt-0.5">{label}</p>
              {total && (
                <div className="mt-1.5 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${Math.round((value / total) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Zap, label: 'Practice a Sales Call', sub: 'AI Role Play', tab: 'practice', color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { icon: BookOpen, label: 'Study a Section', sub: 'Learning Library', tab: 'library', color: 'bg-blue-50 border-blue-200 text-blue-700' },
          { icon: MessageCircle, label: 'Get Coaching', sub: 'AI Sales Coach', tab: 'coach', color: 'bg-violet-50 border-violet-200 text-violet-700' },
          { icon: PenLine, label: 'Review Exercises', sub: 'All 14 exercises', tab: 'exercises', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
        ].map(({ icon: Icon, label, sub, tab, color }) => (
          <button key={tab} onClick={() => onNavigate(tab)}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-95 ${color}`}>
            <Icon className="h-6 w-6 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs opacity-70">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Daily tip */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Daily Tip</span>
        </div>
        <p className="text-sm text-amber-900 leading-relaxed">"{todayTip}"</p>
      </div>

      {/* Section checklist */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-gray-500" />
          <h3 className="font-semibold text-sm text-gray-700">Curriculum Progress</h3>
        </div>
        <div className="space-y-2">
          {SECTIONS.map(s => (
            <div key={s.id} className="flex items-center gap-3 py-1.5">
              <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${sectionsRead.includes(s.id) ? 'text-green-500' : 'text-gray-200'}`} />
              <span className={`text-sm flex-1 ${sectionsRead.includes(s.id) ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                {s.number}. {s.title}
              </span>
              <span className="text-xs text-gray-400">{s.readTime}</span>
            </div>
          ))}
        </div>
        <button onClick={() => onNavigate('library')}
          className="mt-3 w-full text-center text-sm text-violet-600 font-medium hover:text-violet-700">
          Open Learning Library →
        </button>
      </div>
    </div>
  );
}
