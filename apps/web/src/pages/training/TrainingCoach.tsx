import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Loader2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';

interface Message { role: 'user' | 'assistant'; content: string }

const SALES_SUGGESTIONS = [
  "How do I respond to 'we already have contractors'?",
  'Write me a follow-up email for a PM I visited today',
  'How do I approach a builder on a job site?',
  'I just got rejected — what do I do next?',
  'What should I say when they ask about pricing?',
];

const TECH_SUGGESTIONS = [
  'How do I handle a difficult customer on a job site?',
  'What should I do if I find unexpected damage during a job?',
  'How do I communicate delays professionally?',
  'Best practices for a clean job site?',
  'How do I upsell additional services without being pushy?',
];

interface Props {
  userRole: string;
}

export function TrainingCoach({ userRole }: Props) {
  const isSales = userRole === 'sales';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const { data } = await api.post('/training-interactive/coach-chat', {
        messages: newMessages,
        userRole,
      });
      setMessages(m => [...m, { role: 'assistant', content: data.data.message }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection issue — please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = isSales ? SALES_SUGGESTIONS : TECH_SUGGESTIONS;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto" style={{ minHeight: '500px' }}>
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <Sparkles className="h-5 w-5 text-violet-600" />
        <h2 className="font-bold text-gray-900">{isSales ? 'AI Sales Coach' : 'AI Tech Coach'}</h2>
        <span className="ml-auto text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">AI Coach</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div>
            <div className="bg-violet-50 rounded-2xl p-4 mb-4">
              <p className="text-sm text-violet-800 font-medium mb-1">
                {isSales ? '👋 Hey! I\'m your Blue Dingo sales coach.' : '👋 Hey! I\'m your field service coach.'}
              </p>
              <p className="text-sm text-violet-700">
                {isSales
                  ? 'Ask me anything — objection help, follow-up emails, how to handle a real situation you just encountered, or general sales coaching.'
                  : 'Ask me anything — job site situations, customer communication, technical questions, or career coaching.'}
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-2 font-medium">Suggested questions:</p>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  className="w-full text-left text-sm px-3 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-violet-50 hover:border-violet-300 transition-colors text-gray-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-violet-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
            }`}>
              {m.content.split('\n').map((line, li) => (
                <span key={li}>{line}{li < m.content.split('\n').length - 1 && <br />}</span>
              ))}
              {m.role === 'assistant' && (
                <p className="text-[10px] text-gray-400 mt-1.5">AI Coach</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              <span className="text-sm text-gray-500">Coach is thinking...</span>
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
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={isSales ? 'Ask your sales coach anything...' : 'Ask your coach anything...'}
          className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400"
          disabled={loading}
        />
        <button onClick={() => send()}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl transition-colors">
          <Send className="h-4 w-4" />
        </button>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors">
            New
          </button>
        )}
      </div>
    </div>
  );
}
