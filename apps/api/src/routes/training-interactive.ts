import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const trainingInteractiveRouter = Router();
trainingInteractiveRouter.use(authenticate);

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// ── Progress ──────────────────────────────────────────────────────────────────

trainingInteractiveRouter.get('/progress', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const progress = await prisma.trainingUserProgress.upsert({
    where: { userId },
    create: { userId, tenantId },
    update: {},
  });
  res.json({ success: true, data: progress } satisfies ApiResponse);
});

trainingInteractiveRouter.post('/progress/section/:sectionId', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const { sectionId } = req.params;

  const today = new Date().toDateString();
  const progress = await prisma.trainingUserProgress.upsert({
    where: { userId },
    create: { userId, tenantId, sectionsRead: [sectionId], lastActivityAt: new Date() },
    update: {},
  });

  // Add sectionId if not already present; update streak
  const alreadyRead = progress.sectionsRead.includes(sectionId);
  const lastDate = progress.lastActivityAt ? new Date(progress.lastActivityAt).toDateString() : null;
  const isNewDay = lastDate !== today;
  const streakBroken = progress.lastActivityAt
    ? (Date.now() - progress.lastActivityAt.getTime()) > 48 * 60 * 60 * 1000
    : false;

  const updated = await prisma.trainingUserProgress.update({
    where: { userId },
    data: {
      sectionsRead: alreadyRead ? progress.sectionsRead : [...progress.sectionsRead, sectionId],
      lastActivityAt: new Date(),
      currentStreak: isNewDay
        ? (streakBroken ? 1 : progress.currentStreak + 1)
        : progress.currentStreak,
    },
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// ── Exercise Answers ──────────────────────────────────────────────────────────

trainingInteractiveRouter.get('/exercise-answers', async (req, res) => {
  const { sub: userId } = req.user!;
  const answers = await prisma.trainingExerciseAnswer.findMany({ where: { userId } });
  res.json({ success: true, data: answers } satisfies ApiResponse);
});

trainingInteractiveRouter.post('/exercise-answers/:exerciseId', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const { exerciseId } = req.params;
  const { answer } = req.body as { answer: string };

  if (!answer?.trim()) { res.status(400).json({ success: false, message: 'Answer required' }); return; }

  const saved = await prisma.trainingExerciseAnswer.upsert({
    where: { userId_exerciseId: { userId, exerciseId } },
    create: { userId, tenantId, exerciseId, answer, status: 'in_progress' },
    update: { answer, status: 'in_progress', updatedAt: new Date() },
  });

  // Update progress exercisesDone list
  const currentProg = await prisma.trainingUserProgress.findUnique({ where: { userId } });
  const newDone = currentProg
    ? (currentProg.exercisesDone.includes(exerciseId) ? currentProg.exercisesDone : [...currentProg.exercisesDone, exerciseId])
    : [exerciseId];
  await prisma.trainingUserProgress.upsert({
    where: { userId },
    create: { userId, tenantId, exercisesDone: [exerciseId], lastActivityAt: new Date() },
    update: { exercisesDone: newDone, lastActivityAt: new Date() },
  });

  res.json({ success: true, data: saved } satisfies ApiResponse);
});

trainingInteractiveRouter.post('/exercise-answers/:exerciseId/feedback', async (req, res) => {
  const { sub: userId } = req.user!;
  const { exerciseId } = req.params;
  const { question, answer } = req.body as { question: string; answer: string };

  if (!answer?.trim()) { res.status(400).json({ success: false, message: 'Answer required' }); return; }

  const msg = await ai.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: `You are a sales coach for Blue Dingo LLC reviewing a written exercise from a new salesperson. Be warm, specific, and constructive. Give a genuine reaction to what they wrote, point out what is strong, suggest one concrete improvement, and if appropriate give them an example of how they might say or do it even better. Keep feedback to 3–5 sentences. Do not be generic.`,
    messages: [{ role: 'user', content: `Exercise question: ${question}\n\nSalesperson's answer: ${answer}` }],
  });

  const feedback = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');

  const updated = await prisma.trainingExerciseAnswer.update({
    where: { userId_exerciseId: { userId, exerciseId } },
    data: { aiFeedback: feedback, status: 'reviewed' },
  });

  res.json({ success: true, data: updated } satisfies ApiResponse);
});

// ── Role Play ─────────────────────────────────────────────────────────────────

trainingInteractiveRouter.get('/role-play-sessions', async (req, res) => {
  const { sub: userId } = req.user!;
  const sessions = await prisma.rolePlaySession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ success: true, data: sessions } satisfies ApiResponse);
});

trainingInteractiveRouter.post('/role-play-message', async (req, res) => {
  const { scenario, difficulty, objection, messages } = req.body as {
    scenario: string;
    difficulty: string;
    objection?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  const systemPrompt = `You are a realistic sales prospect for Blue Dingo LLC, a licensed construction and remodeling company in the Phoenix, Arizona metro area. Blue Dingo provides repairs, painting, flooring, bathroom renovations, and make-ready/turnover services. The salesperson practicing is new and learning.

Play your assigned role authentically. Do not make it too easy or too hard unless the difficulty setting says otherwise. Use realistic objections and responses that a real property manager or builder in Phoenix would give.

Stay in character until told to end. Keep your responses concise and realistic — short responses like a real person in a real conversation. Do not reveal that you are an AI.

Current scenario: ${scenario}
Difficulty: ${difficulty}${objection ? `\nSpecific objection to introduce: ${objection}` : ''}`;

  const msg = await ai.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const reply = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  res.json({ success: true, data: { message: reply } } satisfies ApiResponse);
});

trainingInteractiveRouter.post('/role-play-sessions', async (req, res) => {
  const { sub: userId, tenantId } = req.user!;
  const { scenario, difficulty, objection, transcript } = req.body as {
    scenario: string;
    difficulty: string;
    objection?: string;
    transcript: Array<{ role: string; content: string }>;
  };

  // Generate debrief
  const debriefMsg = await ai.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `You are an expert sales coach for Blue Dingo LLC. You just observed a role play session between a new salesperson and an AI prospect. Now step out of character completely and deliver a structured coaching debrief. Format your response with these exact sections:

**What You Did Well:**
(Be specific — quote or paraphrase what they actually said)

**Areas to Improve:**
(1–2 concrete suggestions with example rewrites)

**Rating:** [Needs Practice / Getting There / Strong / Excellent]

**Your Drill for Next Time:**
(One specific exercise to practice before their next session)

Be warm, encouraging, and specific. Reference the actual conversation content.`,
    messages: [
      {
        role: 'user',
        content: `Scenario: ${scenario} | Difficulty: ${difficulty}${objection ? ` | Objection: ${objection}` : ''}\n\nFull conversation:\n${transcript.map(m => `${m.role === 'user' ? 'Salesperson' : 'Prospect'}: ${m.content}`).join('\n')}`,
      },
    ],
  });

  const debrief = debriefMsg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');

  // Extract rating
  const ratingMatch = debrief.match(/\*\*Rating:\*\*\s*(Needs Practice|Getting There|Strong|Excellent)/i);
  const rating = ratingMatch ? ratingMatch[1].toLowerCase().replace(' ', '_') : 'getting_there';

  const session = await prisma.rolePlaySession.create({
    data: { tenantId, userId, scenario, difficulty, objection: objection || null, transcript, debrief, rating },
  });

  // Increment rolePlayCount and update streak
  await prisma.trainingUserProgress.upsert({
    where: { userId },
    create: { userId, tenantId, rolePlayCount: 1, lastActivityAt: new Date() },
    update: { rolePlayCount: { increment: 1 }, lastActivityAt: new Date() },
  });

  res.json({ success: true, data: session } satisfies ApiResponse);
});

// ── Coach Chat ────────────────────────────────────────────────────────────────

trainingInteractiveRouter.post('/coach-chat', async (req, res) => {
  const { role } = req.user!;
  const { messages, userRole } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    userRole?: string;
  };

  const effectiveRole = userRole || role;
  const isSales = effectiveRole === 'sales';

  const systemPrompt = isSales
    ? `You are an expert sales coach for Blue Dingo LLC, a licensed construction and remodeling company serving the Phoenix, Arizona metro area. Blue Dingo's services include: general repairs, interior and exterior painting, flooring (tile, LVP, carpet), bathroom renovations, make-ready/unit turnover services for rental properties, kitchen updates, and permitted construction/remodeling projects.

Their two primary sales targets are:
1. Property management companies — selling Blue Dingo as a preferred vendor for ongoing maintenance and turnover work
2. Builders and general contractors — selling Blue Dingo as a reliable subcontractor for finish work, paint, flooring, and tile

The salesperson you are coaching is new and learning. They are selling in the Phoenix metro area. Be warm, encouraging, specific, and practical. Give real examples and real scripts when asked. Never be generic — always tie your advice to the actual Blue Dingo context. When they describe a real situation they encountered, help them debrief it and figure out what to do next.

Keep responses concise and conversational — this is a coach in their pocket, not a lecture.`
    : `You are an expert field service coach helping technicians improve their skills, deliver better service, and handle challenging job situations. You help with technical troubleshooting, customer communication, safety best practices, job site professionalism, and career development. Be practical, specific, and encouraging. When technicians describe job situations, help them work through them with clear, actionable advice. Keep responses concise — this is a coach in their pocket.`;

  const msg = await ai.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });

  const reply = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  res.json({ success: true, data: { message: reply } } satisfies ApiResponse);
});

// ── Admin: Team Progress ──────────────────────────────────────────────────────

trainingInteractiveRouter.get('/admin/team-progress', async (req, res) => {
  const { tenantId, role } = req.user!;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ success: false, message: 'Forbidden' }); return;
  }

  const [progress, sessions, answers] = await Promise.all([
    prisma.trainingUserProgress.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    }),
    prisma.rolePlaySession.groupBy({
      by: ['userId'],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.trainingExerciseAnswer.groupBy({
      by: ['userId'],
      where: { tenantId, status: 'reviewed' },
      _count: { id: true },
    }),
  ]);

  const data = progress.map(p => ({
    user: p.user,
    sectionsRead: p.sectionsRead.length,
    exercisesDone: p.exercisesDone.length,
    rolePlayCount: sessions.find(s => s.userId === p.user.id)?._count.id ?? 0,
    exercisesReviewed: answers.find(a => a.userId === p.user.id)?._count.id ?? 0,
    currentStreak: p.currentStreak,
    lastActivityAt: p.lastActivityAt,
  }));

  res.json({ success: true, data } satisfies ApiResponse);
});
