import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { QUICK_REF_CARDS, WALK_IN_CHECKLIST } from './trainingContent';

export function TrainingQuickRef() {
  const [cardIndex, setCardIndex] = useState(0);
  const [checked, setChecked] = useState<boolean[]>(WALK_IN_CHECKLIST.map(() => false));
  const [showChecklist, setShowChecklist] = useState(false);

  const card = QUICK_REF_CARDS[cardIndex];

  const TAG_COLORS: Record<string, string> = {
    PM: 'bg-blue-500 text-white',
    Builder: 'bg-amber-500 text-white',
    All: 'bg-violet-500 text-white',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Quick Reference</h2>
        <button
          onClick={() => setShowChecklist(!showChecklist)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors">
          <ClipboardList className="h-3.5 w-3.5" /> I'm About to Walk In
        </button>
      </div>

      {/* Walk-in checklist */}
      {showChecklist && (
        <div className="bg-gray-900 text-white rounded-2xl p-5 space-y-3">
          <p className="font-bold text-sm text-amber-400 uppercase tracking-wide">Pre-Visit Checklist</p>
          {WALK_IN_CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => setChecked(c => { const n = [...c]; n[i] = !n[i]; return n; })}
                className="mt-0.5 rounded border-gray-600 text-amber-500 focus:ring-amber-500 flex-shrink-0"
              />
              <span className={`text-sm ${checked[i] ? 'line-through text-gray-500' : 'text-gray-100'}`}>{item}</span>
            </label>
          ))}
          <button onClick={() => { setChecked(WALK_IN_CHECKLIST.map(() => false)); setShowChecklist(false); }}
            className="text-xs text-gray-500 hover:text-gray-400 mt-1">Reset & Close</button>
        </div>
      )}

      {/* Card carousel */}
      <div className="bg-gray-900 text-white rounded-2xl p-6 min-h-[300px] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          {card.tag && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TAG_COLORS[card.tag] ?? 'bg-gray-600 text-white'}`}>
              {card.tag}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-500">{cardIndex + 1} / {QUICK_REF_CARDS.length}</span>
        </div>

        <h3 className="text-lg font-bold text-white mb-4">{card.title}</h3>
        <div className="flex-1">
          <p className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap font-medium">
            {card.content}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCardIndex(i => Math.max(0, i - 1))}
          disabled={cardIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <div className="flex-1 flex justify-center gap-1.5">
          {QUICK_REF_CARDS.map((_, i) => (
            <button key={i} onClick={() => setCardIndex(i)}
              className={`h-2 rounded-full transition-all ${i === cardIndex ? 'w-6 bg-violet-600' : 'w-2 bg-gray-300'}`} />
          ))}
        </div>
        <button
          onClick={() => setCardIndex(i => Math.min(QUICK_REF_CARDS.length - 1, i + 1))}
          disabled={cardIndex === QUICK_REF_CARDS.length - 1}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Card grid for quick jump */}
      <div className="grid grid-cols-2 gap-2">
        {QUICK_REF_CARDS.map((c, i) => (
          <button key={c.id} onClick={() => setCardIndex(i)}
            className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              i === cardIndex ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {c.title}
          </button>
        ))}
      </div>
    </div>
  );
}
