import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const ROLE_GREETINGS: Record<string, string> = {
  owner: "Hi! I can create jobs, find customers, check schedules, and send reminders. What do you need?",
  admin: "Hi! I can create jobs, find customers, check schedules, and send reminders. What do you need?",
  dispatcher: "Hi! I can create jobs, assign technicians, check schedules, and send reminders. What do you need?",
  technician: "Hi! I can check your schedule and jobs for today. What would you like to know?",
  sales: "Hi! I can create customers, schedule appointments, and check availability. How can I help?",
};

const SUGGESTIONS: Record<string, string[]> = {
  owner: ['Schedule a job for tomorrow', 'Who is available today?', 'Show me today\'s schedule', 'Send a reminder for next job'],
  admin: ['Schedule a job for tomorrow', 'Who is available today?', 'Show me today\'s schedule', 'Send a reminder for next job'],
  dispatcher: ['Show unassigned jobs', 'Who is available today?', 'Schedule a job for tomorrow', 'Send reminder to customer'],
  technician: ['What are my jobs today?', 'Show tomorrow\'s schedule'],
  sales: ['Create a new customer', 'Schedule an appointment', 'Show today\'s appointments'],
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export function AIAssistant() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = user?.role ?? 'owner';
  const greeting = ROLE_GREETINGS[role] ?? ROLE_GREETINGS.owner;
  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.owner;

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: greeting }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');

    const next: Message[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/chat', { messages: next, timezone });
      setMessages([...next, { role: 'assistant', content: data.data.message }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className={`fixed bottom-6 right-6 z-50 w-[360px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all ${minimized ? 'h-14' : 'h-[520px]'}`}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-100 flex-shrink-0 bg-indigo-600 rounded-t-2xl">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">AI Assistant</p>
              <p className="text-xs text-indigo-200">Powered by Claude</p>
            </div>
            <button onClick={() => setMinimized((v) => !v)} className="text-white/70 hover:text-white p-1">
              <ChevronDown className={`h-4 w-4 transition-transform ${minimized ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => { setOpen(false); setMinimized(false); }}
              className="text-white/70 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-indigo-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm">
                      <TypingDots />
                    </div>
                  </div>
                )}

                {/* Quick suggestions (only when just greeting shown) */}
                {messages.length === 1 && !loading && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 p-3 flex-shrink-0">
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                    placeholder="Ask me anything..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading}
                    className="h-7 w-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Send className="h-3.5 w-3.5 text-white" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
