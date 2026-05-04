import { useState, useRef, useEffect } from 'react';
import { Zap, Send, Loader2, Sparkles, Trophy, RotateCcw, CheckCircle2, ArrowLeft, History } from 'lucide-react';
import { SCENARIOS, DIFFICULTIES, OBJECTIONS } from './trainingContent';
import { api } from '../../lib/api';

interface Message { role: 'user' | 'assistant'; content: string }

interface Session {
  id: string;
  scenario: string;
  difficulty: string;
  debrief?: string;
  rating?: string;
  createdAt: string;
}

const RATING_STYLES: Record<string, { label: string; color: string }> = {
  needs_practice: { label: 'Needs Practice', color: 'bg-red-100 text-red-700' },
  getting_there: { label: 'Getting There', color: 'bg-amber-100 text-amber-700' },
  strong: { label: 'Strong', color: 'bg-blue-100 text-blue-700' },
  excellent: { label: 'Excellent!', color: 'bg-green-100 text-green-700' },
};

interface Props {
  sessions: Session[];
  onSessionSaved: () => void;
}

type Screen = 'setup' | 'play' | 'debrief' | 'history';

export function TrainingRolePlay({ sessions, onSessionSaved }: Props) {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState({ scenario: 'pm_walkin', difficulty: 'neutral', objection: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [debrief, setDebrief] = useState<{ text: string; rating: string } | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const startSession = async () => {
    setMessages([]);
    setDebrief(null);
    setScreen('play');
    setLoading(true);
    try {
      const { data } = await api.post('/training-interactive/role-play-message', {
        scenario: config.scenario,
        difficulty: config.difficulty,
        objection: config.objection || undefined,
        messages: [{ role: 'user', content: 'START' }],
      });
      setMessages([{ role: 'assistant', content: data.data.message }]);
    } catch {
      setMessages([{ role: 'assistant', content: 'Hi there, can I help you?' }]);
    } finally { setLoading(false); }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || loading) return;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const { data } = await api.post('/training-interactive/role-play-message', {
        scenario: config.scenario,
        difficulty: config.difficulty,
        objection: config.objection || undefined,
        messages: newMessages,
      });
      setMessages(m => [...m, { role: 'assistant', content: data.data.message }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I missed that — could you say it again?' }]);
    } finally { setLoading(false); }
  };

  const endSession = async () => {
    if (messages.length < 2) { setScreen('setup'); return; }
    setSavingSession(true);
    try {
      const { data } = await api.post('/training-interactive/role-play-sessions', {
        scenario: config.scenario,
        difficulty: config.difficulty,
        objection: config.objection || undefined,
        transcript: messages,
      });
      setDebrief({ text: data.data.debrief ?? '', rating: data.data.rating ?? 'getting_there' });
      setScreen('debrief');
      onSessionSaved();
    } catch { /* ignore */ } finally { setSavingSession(false); }
  };

  const scenarioLabel = SCENARIOS.find(s => s.value === config.scenario)?.label ?? config.scenario;
  const difficultyLabel = DIFFICULTIES.find(d => d.value === config.difficulty)?.label ?? config.difficulty;

  if (screen === 'history') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen('setup')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h3 className="font-bold text-gray-900">Practice History</h3>
        </div>
        {sessions.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No sessions yet — practice your first call!</p>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => {
              const rating = RATING_STYLES[s.rating ?? 'getting_there'];
              return (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{SCENARIOS.find(sc => sc.value === s.scenario)?.label ?? s.scenario}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rating.color}`}>{rating.label}</span>
                  </div>
                  {s.debrief && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-3 leading-relaxed">{s.debrief.slice(0, 200)}...</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (screen === 'debrief' && debrief) {
    const rating = RATING_STYLES[debrief.rating] ?? RATING_STYLES.getting_there;
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center py-4">
          <Trophy className="h-10 w-10 text-amber-500 mx-auto mb-2" />
          <h2 className="font-bold text-xl text-gray-900">Session Complete!</h2>
          <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full mt-2 ${rating.color}`}>
            {rating.label}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-500" /> AI Coach Debrief
            <span className="ml-auto text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">AI Coach</span>
          </h3>
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap space-y-2">
            {debrief.text.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) {
                const inner = line.slice(2, -2);
                const colorClass = inner.includes('Did Well') ? 'text-green-700 bg-green-50' :
                  inner.includes('Improve') ? 'text-amber-700 bg-amber-50' :
                  inner.includes('Drill') ? 'text-blue-700 bg-blue-50' :
                  inner.includes('Rating') ? `${rating.color}` : 'text-gray-900 bg-gray-50';
                return <p key={i} className={`font-bold px-2 py-1 rounded text-xs uppercase tracking-wide ${colorClass}`}>{inner}</p>;
              }
              if (line === '') return <div key={i} className="h-1" />;
              return <p key={i}>{line}</p>;
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setScreen('setup'); setMessages([]); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RotateCcw className="h-4 w-4" /> Try Again
          </button>
          <button onClick={() => setScreen('history')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold">
            <History className="h-4 w-4" /> View History
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'play') {
    return (
      <div className="flex flex-col max-w-2xl mx-auto" style={{ minHeight: '520px' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-500">{scenarioLabel}</p>
            <p className="text-xs text-gray-400">{difficultyLabel}</p>
          </div>
          <button onClick={endSession} disabled={savingSession}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold rounded-lg transition-colors">
            {savingSession ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            End Session & Get Debrief
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          <div className="text-center text-xs text-gray-400 bg-gray-50 rounded-lg py-2 px-3">
            Role play started. You're the salesperson — they're the prospect. Good luck!
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 text-white text-xs font-bold">P</div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}>
                {m.content}
                {m.role === 'assistant' && <p className="text-[10px] text-gray-400 mt-1">Prospect</p>}
                {m.role === 'user' && <p className="text-[10px] text-violet-300 mt-1">You</p>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">P</div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 pt-3 border-t border-gray-200 flex-shrink-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Type your response..."
            disabled={loading || savingSession}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400"
          />
          <button onClick={sendMessage} disabled={!input.trim() || loading || savingSession}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Setup screen
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 bg-white';
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="font-bold text-gray-900">AI Sales Call Simulator</h2>
        </div>
        {sessions.length > 0 && (
          <button onClick={() => setScreen('history')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <History className="h-4 w-4" /> History ({sessions.length})
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Scenario</label>
          <select value={config.scenario} onChange={e => setConfig(c => ({ ...c, scenario: e.target.value }))} className={inp}>
            {SCENARIOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Difficulty</label>
          <select value={config.difficulty} onChange={e => setConfig(c => ({ ...c, difficulty: e.target.value }))} className={inp}>
            {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Specific Objection to Practice <span className="text-gray-400 font-normal">(optional)</span></label>
          <select value={config.objection} onChange={e => setConfig(c => ({ ...c, objection: e.target.value }))} className={inp}>
            <option value="">— None, let it flow naturally —</option>
            {OBJECTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <strong>How it works:</strong> The AI plays a realistic prospect. You type your responses as the salesperson. After 8–12 exchanges, click "End Session" to get a detailed coaching debrief.
      </div>

      <button onClick={startSession}
        className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2">
        <Zap className="h-5 w-5" /> Start Practice Session
      </button>
    </div>
  );
}
