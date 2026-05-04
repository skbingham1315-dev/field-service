import { useState } from 'react';
import { CheckCircle2, Clock, ArrowLeft, BookOpen, Zap } from 'lucide-react';
import { SECTIONS, EXERCISES } from './trainingContent';
import { api } from '../../lib/api';

interface Props {
  sectionsRead: string[];
  onSectionRead: (sectionId: string) => void;
  onPracticeSection?: (sectionId: string) => void;
}

export function TrainingLibrary({ sectionsRead, onSectionRead, onPracticeSection }: Props) {
  const [selectedSection, setSelectedSection] = useState<typeof SECTIONS[0] | null>(null);
  const [marking, setMarking] = useState(false);

  const handleMarkRead = async (sectionId: string) => {
    setMarking(true);
    try {
      await api.post(`/training-interactive/progress/section/${sectionId}`);
      onSectionRead(sectionId);
    } catch { /* ignore */ } finally { setMarking(false); }
  };

  if (selectedSection) {
    const sectionExercises = EXERCISES.filter(e => e.sectionId === selectedSection.id);
    const isRead = sectionsRead.includes(selectedSection.id);
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setSelectedSection(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Library
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white">
            <div className="flex items-center gap-2 text-violet-200 text-xs mb-1">
              <Clock className="h-3.5 w-3.5" /> {selectedSection.readTime} read
            </div>
            <h2 className="font-bold text-xl">Section {selectedSection.number}</h2>
            <h3 className="font-semibold text-lg text-violet-100">{selectedSection.title}</h3>
          </div>

          <div className="p-5">
            {/* Content — render markdown-ish */}
            <div className="prose prose-sm max-w-none text-gray-800">
              {selectedSection.content.split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-gray-900 mt-4 mb-2">{line.slice(3)}</h2>;
                if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-gray-900">{line.slice(2, -2)}</p>;
                if (line.startsWith('> *"') && line.endsWith('"*')) {
                  return (
                    <blockquote key={i} className="my-2 pl-3 border-l-4 border-violet-400 italic text-gray-700 text-sm">
                      {line.slice(4, -2)}
                    </blockquote>
                  );
                }
                if (line.startsWith('- **')) {
                  const parts = line.slice(2).split('** — ');
                  if (parts.length === 2) return <p key={i} className="ml-2 text-sm my-1"><strong>{parts[0].slice(2)}</strong> — {parts[1]}</p>;
                }
                if (line.startsWith('- ')) return <p key={i} className="ml-2 text-sm my-0.5 text-gray-700">• {line.slice(2)}</p>;
                if (line.startsWith('**') && line.includes('** ')) {
                  const match = line.match(/\*\*(.*?)\*\*(.*)/);
                  if (match) return <p key={i} className="text-sm my-1"><strong className="text-gray-900">{match[1]}</strong>{match[2]}</p>;
                }
                if (line === '---') return <hr key={i} className="my-4 border-gray-200" />;
                if (line === '') return <div key={i} className="h-1" />;
                return <p key={i} className="text-sm text-gray-700 my-1 leading-relaxed">{line}</p>;
              })}
            </div>

            {/* Exercises for this section */}
            {sectionExercises.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Exercises in this section:</h4>
                <div className="space-y-2">
                  {sectionExercises.map(e => (
                    <div key={e.id} className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium text-gray-800">Exercise {e.number}:</span> {e.question.slice(0, 80)}…
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => !isRead && handleMarkRead(selectedSection.id)}
                disabled={marking}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isRead
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                }`}>
                <CheckCircle2 className="h-4 w-4" />
                {isRead ? 'Completed' : marking ? 'Marking...' : 'Mark as Read'}
              </button>
              {onPracticeSection && (
                <button
                  onClick={() => onPracticeSection(selectedSection.id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors">
                  <Zap className="h-4 w-4" /> Practice This
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="h-5 w-5 text-violet-600" />
        <h2 className="font-bold text-gray-900">Learning Library</h2>
        <span className="ml-auto text-sm text-gray-500">{sectionsRead.length}/{SECTIONS.length} completed</span>
      </div>
      {SECTIONS.map(section => {
        const isRead = sectionsRead.includes(section.id);
        const exerciseCount = EXERCISES.filter(e => e.sectionId === section.id).length;
        return (
          <button key={section.id} onClick={() => setSelectedSection(section)}
            className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all flex items-start gap-4">
            <div className={`mt-0.5 h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              isRead ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700'
            }`}>
              {isRead ? <CheckCircle2 className="h-5 w-5" /> : section.number}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 text-sm">{section.title}</p>
                {isRead && <span className="text-xs text-green-600 font-medium">✓ Read</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {section.readTime}</span>
                <span>{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
