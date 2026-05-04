import { useState } from 'react';
import { PenLine, Loader2, Sparkles, CheckCircle2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { EXERCISES, SECTIONS } from './trainingContent';
import { api } from '../../lib/api';

interface ExerciseAnswer {
  exerciseId: string;
  answer: string;
  aiFeedback?: string;
  status: string;
}

interface Props {
  answers: ExerciseAnswer[];
  onAnswerSaved: (exerciseId: string, answer: string, feedback?: string, status?: string) => void;
}

export function TrainingExercises({ answers, onAnswerSaved }: Props) {
  const [selected, setSelected] = useState<typeof EXERCISES[0] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const getAnswer = (exerciseId: string) => answers.find(a => a.exerciseId === exerciseId);

  const openExercise = (exercise: typeof EXERCISES[0]) => {
    setSelected(exercise);
    setDraft(getAnswer(exercise.id)?.answer ?? '');
  };

  const handleSave = async () => {
    if (!selected || !draft.trim()) return;
    setSaving(true);
    try {
      await api.post(`/training-interactive/exercise-answers/${selected.id}`, { answer: draft });
      onAnswerSaved(selected.id, draft);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleGetFeedback = async () => {
    if (!selected || !draft.trim()) return;
    setLoadingFeedback(true);
    try {
      // Save first
      await api.post(`/training-interactive/exercise-answers/${selected.id}`, { answer: draft });
      const { data } = await api.post(`/training-interactive/exercise-answers/${selected.id}/feedback`, {
        question: selected.question,
        answer: draft,
      });
      onAnswerSaved(selected.id, draft, data.data.aiFeedback, 'reviewed');
      setSelected(s => s ? { ...s } : null); // refresh
    } catch { /* ignore */ } finally { setLoadingFeedback(false); }
  };

  if (selected) {
    const savedAnswer = getAnswer(selected.id);
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Exercises
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div>
            <span className="text-xs font-bold text-violet-600 uppercase tracking-wide">Exercise {selected.number}</span>
            <p className="text-base font-semibold text-gray-900 mt-1 leading-snug">{selected.question}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Your Answer <span className="text-gray-400 font-normal">({draft.length} characters)</span>
            </label>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={8}
              placeholder="Write your answer here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 resize-y"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !draft.trim()}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save Draft
            </button>
            <button onClick={handleGetFeedback} disabled={loadingFeedback || !draft.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
              {loadingFeedback
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Getting feedback...</>
                : <><Sparkles className="h-4 w-4" /> Submit for AI Feedback</>}
            </button>
          </div>

          {/* AI Feedback */}
          {savedAnswer?.aiFeedback && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">AI Coach Feedback</span>
              </div>
              <p className="text-sm text-violet-900 leading-relaxed whitespace-pre-wrap">{savedAnswer.aiFeedback}</p>
            </div>
          )}

          {savedAnswer?.status === 'reviewed' && !loadingFeedback && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Exercise reviewed by AI coach
            </div>
          )}
        </div>
      </div>
    );
  }

  const completedCount = answers.filter(a => a.status === 'reviewed').length;

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <PenLine className="h-5 w-5 text-violet-600" />
        <h2 className="font-bold text-gray-900">Training Exercises</h2>
        <span className="ml-auto text-sm text-gray-500">{completedCount}/{EXERCISES.length} reviewed</span>
      </div>

      {SECTIONS.map(section => {
        const sectionExercises = EXERCISES.filter(e => e.sectionId === section.id);
        const isExpanded = expandedSection === section.id || expandedSection === null;
        const sectionCompleted = sectionExercises.filter(e => {
          const a = getAnswer(e.id);
          return a?.status === 'reviewed';
        }).length;

        return (
          <div key={section.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                sectionCompleted === sectionExercises.length ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700'
              }`}>
                {section.number}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{section.title}</p>
                <p className="text-xs text-gray-400">{sectionCompleted}/{sectionExercises.length} completed</p>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {(expandedSection === section.id || expandedSection === null) && (
              <div className="border-t border-gray-100">
                {sectionExercises.map(exercise => {
                  const answer = getAnswer(exercise.id);
                  const hasAnswer = !!answer?.answer;
                  const reviewed = answer?.status === 'reviewed';
                  return (
                    <button key={exercise.id} onClick={() => openExercise(exercise)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                      <div className={`mt-0.5 h-5 w-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                        reviewed ? 'bg-green-500' : hasAnswer ? 'bg-amber-400' : 'bg-gray-200'
                      }`}>
                        {reviewed && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Exercise {exercise.number}</p>
                        <p className="text-sm text-gray-800 leading-snug line-clamp-2">{exercise.question}</p>
                        {reviewed && (
                          <p className="text-xs text-green-600 font-medium mt-0.5">✓ AI feedback received</p>
                        )}
                        {hasAnswer && !reviewed && (
                          <p className="text-xs text-amber-600 font-medium mt-0.5">Draft saved — get AI feedback</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
