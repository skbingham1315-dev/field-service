export interface TrainingSection {
  id: string;
  number: number;
  title: string;
  description: string;
  readTime: string;
  content: string;
  exerciseIds: string[];
}

export interface TrainingExercise {
  id: string;
  sectionId: string;
  number: number;
  question: string;
}

export interface QuickRefCard {
  id: string;
  title: string;
  content: string;
  tag?: string;
}

export const SECTIONS: TrainingSection[] = [
  {
    id: 's1',
    number: 1,
    title: 'Who We Are',
    description: 'Company overview, services, and our belief statement',
    readTime: '3 min',
    exerciseIds: ['e1', 'e2'],
    content: `## Blue Dingo LLC

Blue Dingo is a licensed construction and remodeling company serving the greater Phoenix, Arizona metro area. We provide repair, renovation, and maintenance services to property management companies and builders/general contractors.

---

## Our Services

- **General repairs and maintenance** — We handle the everyday fixes that keep properties running smoothly
- **Interior & exterior painting** — Full residential and commercial painting services
- **Flooring** — Tile, LVP (luxury vinyl plank), and carpet installation and replacement
- **Bathroom renovations** — Tile replacement, fixtures, full bathroom remodels
- **Make-ready / unit turnover services** — Fast, quality turnovers so rental properties rent faster
- **Kitchen updates** — Cabinets, countertops, tile backsplash, fixtures
- **Permitted construction & remodeling** — Full scope renovation projects with proper permitting

---

## Our Two Primary Markets

**1. Property Management Companies**
We become their go-to preferred vendor for ongoing maintenance, repairs, and unit turnovers. When a tenant moves out, they call us. We make their life easier by being reliable, responsive, and communicative — three things that most contractors are not.

**2. Builders & General Contractors**
We become their reliable subcontractor for finish work: paint, flooring, tile, and complete interior finishes. GCs need subs who show up, finish on time, and don't create problems. We are that sub.

---

## Our Belief Statement

We believe that showing up consistently, doing quality work, and being easy to work with is a competitive advantage. Most contractors are unreliable. We are the exception.

Every relationship we build is built on trust, and every job is a chance to prove that trust is well-placed. We don't just do the work — we make people's lives easier by doing it predictably, professionally, and with pride.`,
  },
  {
    id: 's2',
    number: 2,
    title: 'Property Management Playbook',
    description: 'Walk-in approach, scripts, and objection handling for PM companies',
    readTime: '6 min',
    exerciseIds: ['e3', 'e4', 'e5'],
    content: `## Property Management Companies — Your #1 Target

Property management companies have **ongoing, predictable** repair and turnover needs — exactly what Blue Dingo is built for. The goal of your first visit is **not to get a job**. The goal is to get on their vendor list.

---

## Step 1: Research Before You Go

- What company is it? How many properties/units do they manage?
- Who handles maintenance? (Title: Maintenance Coordinator, Facilities Manager, or the owner)
- Check Google reviews — do they mention contractor issues? That's your opening.

---

## Step 2: The Walk-In Script (Front Desk)

> *"Hi! My name is [Your Name] from Blue Dingo. We're a licensed construction and remodeling company here in Phoenix — we specialize in make-ready services and repairs for rental properties. I know [Manager Name] is probably busy, but I'd love to leave some information and potentially set up a quick 10-minute intro sometime. Would that be okay?"*

**Key:** Be warm, brief, and grateful. You're asking for 10 minutes, not a contract.

---

## Step 3: If You Get to the Decision Maker

> *"Hi [Name], I really appreciate you taking a moment. We work with several property management companies in the Phoenix area on their unit turnovers and maintenance — paint, flooring, drywall, and general repairs. A lot of PMs we talk to struggle with contractors who are unreliable or slow to respond. We've built our entire process around being the ones who actually show up and finish on time. Can I ask — how do you currently handle your repair and turnover work?"*

**Then LISTEN.** Don't pitch. Find out their pain before you talk about Blue Dingo.

---

## The 5 Most Common PM Objections

**1. "We already have contractors we work with."**
> *"That's great — most of our best clients felt the same way before they tried us. Would you be open to giving us one turnover to see how we compare? No long-term commitment."*

**2. "We don't need anything right now."**
> *"Totally understood. I'm not here to push anything — I just want to be on your list for when you do. Can I leave you our info and maybe connect on email?"*

**3. "Send me an email."**
> *"Absolutely. Who should I send it to? And what types of work do you outsource most often?"* (Get the email AND learn their pain points)

**4. "We handle it in-house."**
> *"That makes sense for routine stuff. Do you ever hit capacity during busy turnover seasons? We work really well as an overflow option — no ongoing commitment."*

**5. "How are your prices?"**
> *"We're competitive and transparent — we give detailed written quotes before any work starts. Want me to show you a sample estimate so you can see how we present our pricing?"*

---

## The Follow-Up Formula

After every visit:
1. Send a brief email within 24 hours referencing your conversation
2. Connect on LinkedIn if possible
3. Follow up in 30 days with something of value (a tip, a case study, a relevant article)
4. Stay visible — you win by being top-of-mind when they finally have a need`,
  },
  {
    id: 's3',
    number: 3,
    title: 'Builder & Contractor Playbook',
    description: 'Job site approach, phone outreach, and GC relationship building',
    readTime: '5 min',
    exerciseIds: ['e6', 'e7'],
    content: `## Builders & General Contractors — Your #2 Target

Builders and general contractors need reliable subcontractors for finish work. They care about three things: **showing up, finishing on time, and not creating problems**. Most GCs have been burned by subs who flaked. Be the one who doesn't.

---

## The Job Site Approach

- Always have your card or a simple one-pager ready
- Dress clean and professional — you're walking onto someone's job site
- Find the GC or site supervisor (not the workers)
- Keep it under 60 seconds — they are busy

**Job Site Script:**
> *"Hey — are you the GC on this project? I'm [Name] from Blue Dingo. We do finish work for builders in the Phoenix area: paint, flooring, tile, and interior finish-out. I know you're busy, but do you have 60 seconds? I'd love to leave my card and learn more about the types of projects you typically work on."*

---

## Phone / Cold Call Outreach

> *"Hi, is this [Name]? This is [Your Name] from Blue Dingo — we're a licensed construction company in Phoenix that works with GCs as a subcontractor for finish work: paint, flooring, tile, drywall. I found your company [online / at a job site / through a referral]. Do you currently use subs for that type of work on your projects?"*

**If they say yes:** Ask what projects are coming up. Ask what their biggest pain point has been with subs.
**If they say no:** Ask who does it. Ask if that ever creates bottlenecks. Stay curious.

---

## Builder Objections

**1. "I have my guys."**
> *"Understood — do you ever get overloaded on projects where you need overflow? We're really good in that situation and turn around fast."*

**2. "Are you licensed and insured?"**
> *"Yes — ROC licensed, fully insured. Happy to send the certificates right now."*

**3. "We've had bad experiences with subs."**
> *"I hear that constantly — it's the #1 complaint in this industry. The only way I can prove we're different is to do a job. What would it take to give us something small to start?"*

**4. "What's your availability like?"**
> *"We keep our schedule tight specifically so we can respond quickly when a client needs us. What do you have coming up?"*

---

## Building the GC Relationship

Once you get your first job with a GC, the relationship is everything:
- Show up exactly when you said you would
- Communicate proactively — don't make them chase you
- Finish on time or tell them early if there's a problem
- After the job: ask for feedback and another shot

**One great job leads to the next job, and the next, and eventually you're their preferred sub for everything.**`,
  },
  {
    id: 's4',
    number: 4,
    title: 'Core Selling Skills — The LISTEN Framework',
    description: 'The fundamental sales skills that work in any situation',
    readTime: '5 min',
    exerciseIds: ['e8', 'e9', 'e10'],
    content: `## The LISTEN Framework

Every great sales conversation — from a cold walk-in to a follow-up call — follows this pattern. Master this and you can handle any situation.

---

**L — Listen First**
Don't pitch. Ask a question and *actually listen* to the answer. Most salespeople talk too much. Your first goal is to understand their situation before you explain anything about Blue Dingo.

**I — Identify the Pain**
*"What's been your biggest frustration with contractors?"*
*"What matters most to you when you're choosing a sub?"*
These questions reveal what they actually care about — which is what you should address.

**S — Share Relevantly**
Once you know their pain, share a specific story or example that addresses it.
*"One of our PM clients had the same issue — contractors not showing up on time. Here's how we handled that for them..."*

**T — Test the Interest**
*"Does that sound like the kind of relationship you'd want?"*
*"If we could prove that to you on one job, would that be worth trying?"*
Soft-close the idea before going for the commitment.

**E — Earn the Next Step**
Always end with a clear ask:
- "Can I get on your approved vendor list?"
- "Can I send you a sample quote?"
- "Can we schedule a quick call next week?"
Never leave without a defined next step.

**N — Nurture the Relationship**
One visit is rarely enough. Follow up. Stay visible. Remember personal details. Send a quick check-in after a job. **The relationship is the asset.**

---

## The 5 Power Questions

These questions work in almost any sales conversation. Learn them cold.

1. *"How do you currently handle your [repair/turnover/finish] work?"*
2. *"What's been your biggest frustration with the contractors you've used?"*
3. *"If you could change one thing about your current vendor situation, what would it be?"*
4. *"What would you need to see to feel confident adding a new vendor?"*
5. *"How quickly do things typically need to happen when a unit turns over?"*

---

## Body Language & Presence

- Stand straight, make direct eye contact, smile genuinely
- Don't fidget or check your phone
- Slow down when you speak — confidence sounds calm and measured
- Mirror their energy level: relaxed if they're relaxed, brief if they're busy
- A firm handshake (not crushing, not limp) sets the tone immediately

---

## Silence Is a Tool

After asking a question, **be quiet**. Many salespeople are so uncomfortable with silence that they fill it by answering their own question. Don't. Let them think. The person who speaks first after a question is at a disadvantage.`,
  },
  {
    id: 's5',
    number: 5,
    title: 'Personal Growth Plan',
    description: 'Weekly review habits, rejection handling, and performance benchmarks',
    readTime: '4 min',
    exerciseIds: ['e11', 'e12'],
    content: `## Your Weekly Review Habit

Every Sunday or Monday morning, spend 15 minutes asking yourself:

1. How many new contacts did I make last week?
2. How many follow-ups did I complete?
3. What objections did I get? What worked? What didn't?
4. What's my #1 focus for this week?

Write the answers down. Salespeople who review their own performance improve faster than those who don't.

---

## Rejection Handling

Every "no" is **data, not failure**. Ask yourself:
- What specifically did they object to?
- Was it timing, price, existing relationships, or something I said?
- What would I do differently?

**The truth about rejection in this business:**
- Most rejections are not personal — it's timing, existing relationships, or budget
- The goal is to stay visible and top-of-mind. "No today" often becomes "Yes in 3 months"
- The salespeople who fail are the ones who stop after rejection. The ones who win are the ones who keep going.

After any rejection: Write down what they said → Practice your response → Move on immediately. Don't sit in it.

---

## Your Performance Benchmarks

Track these numbers every week:

| Metric | Minimum | Goal |
|---|---|---|
| New contacts | 5 | 10+ |
| Follow-ups completed | 3 | 8+ |
| Role plays practiced | 1 | 3+ |
| Active opportunities | Track all | — |

---

## Building Your Daily Routine

**Morning:**
- Review your route and who you're visiting today
- Pull up any notes from previous conversations
- Mentally rehearse your opener

**During visits:**
- Take quick notes immediately after each conversation (use your phone)
- Log every contact, what you discussed, and the next step

**End of day:**
- Update the CRM with all contacts and notes
- Set follow-up reminders for every conversation
- Ask: "Did I do what I said I'd do today?"

**Weekly:**
- Run your weekly review (see above)
- Identify your best and worst conversations — learn from both`,
  },
  {
    id: 's6',
    number: 6,
    title: 'Quick Reference Card',
    description: 'All key scripts and questions in one place',
    readTime: '2 min',
    exerciseIds: ['e13', 'e14'],
    content: `## All Key Scripts — At a Glance

This section is a companion to the Quick Reference screen. Use it to study; use the Quick Ref screen when you're about to walk in.

---

## PM Scripts

**Front Desk:**
*"Hi, I'm [Name] from Blue Dingo. We do make-ready and repair services for rental properties. Could I leave some info for the person who handles maintenance vendors?"*

**Decision Maker:**
*"We specialize in making PMs' lives easier by being reliable and responsive. How are you currently handling your turnovers and repairs?"*

---

## Builder Scripts

**Job Site:**
*"Hey — are you the GC? I'm [Name] from Blue Dingo. We do finish work for builders. Do you have 60 seconds?"*

**Phone:**
*"Hi [Name], this is [Your Name] from Blue Dingo — licensed contractor in Phoenix. We sub for GCs on paint, flooring, and tile. Do you currently use subs for that work?"*

---

## Quick Objection Responses

| Objection | Response |
|---|---|
| "We have contractors." | "Would you try us on one job to see how we compare?" |
| "Not interested." | "Totally understood — can I leave my card for when things change?" |
| "Send an email." | "Of course — and what types of work do you outsource most?" |
| "We do it in-house." | "Do you ever hit capacity? We're a great overflow option." |
| "How's pricing?" | "Competitive and transparent — want to see a sample quote?" |

---

## The 5 Power Questions (Memorize These)

1. How do you handle [category] work currently?
2. What's your biggest frustration with contractors?
3. What would you need to see from us?
4. How quickly do you typically need things done?
5. Who else should I talk to here?`,
  },
];

export const EXERCISES: TrainingExercise[] = [
  { id: 'e1', sectionId: 's1', number: 1, question: 'In your own words, describe what Blue Dingo does and who we serve. Write it as if someone just asked "So what does your company do?" Keep it under 60 seconds to say out loud.' },
  { id: 'e2', sectionId: 's1', number: 2, question: 'Write a one-sentence belief statement that you personally believe about delivering quality service and building relationships in this industry.' },
  { id: 'e3', sectionId: 's2', number: 3, question: 'Write your version of the PM Front Desk script. Make it sound like you — natural and conversational, not robotic.' },
  { id: 'e4', sectionId: 's2', number: 4, question: 'Write your version of the PM Decision Maker opening. Include at least one open-ended question at the end to start a conversation.' },
  { id: 'e5', sectionId: 's2', number: 5, question: 'Pick the PM objection you find hardest to handle and write your full response to it, in your own words.' },
  { id: 'e6', sectionId: 's3', number: 6, question: 'Write your version of the Builder Job Site script. Keep it under 60 words — they\'re busy.' },
  { id: 'e7', sectionId: 's3', number: 7, question: 'Write a cold call opening for a builder you found online. Include how you found them and end with a qualifying question.' },
  { id: 'e8', sectionId: 's4', number: 8, question: 'Describe a real or imagined conversation where you used one of the LISTEN steps. What did you say? What happened? What would you do the same or differently?' },
  { id: 'e9', sectionId: 's4', number: 9, question: 'Write 3 original "pain finding" questions that you could use in a Property Management conversation — different from the ones in the workbook.' },
  { id: 'e10', sectionId: 's4', number: 10, question: 'What is your personal version of the "earn the next step" close? Write out exactly what you would say at the end of a first PM meeting.' },
  { id: 'e11', sectionId: 's5', number: 11, question: 'Describe your personal weekly review routine. What specific things will you track? When will you do it? What will you do with what you learn?' },
  { id: 'e12', sectionId: 's5', number: 12, question: 'Write about a time you got rejected or turned down (real or imagined). How did you handle it in the moment? How would you handle it better now?' },
  { id: 'e13', sectionId: 's6', number: 13, question: 'From memory only (don\'t look back), write as many key scripts from the Quick Reference as you can. Then check how you did.' },
  { id: 'e14', sectionId: 's6', number: 14, question: 'Describe your ideal sales day from start to finish — what would you do, in what order, to maximize new contacts, follow-ups, and relationship building?' },
];

export const QUICK_REF_CARDS: QuickRefCard[] = [
  {
    id: 'pm-front-desk',
    title: 'PM Front Desk Opener',
    tag: 'PM',
    content: `"Hi! I'm [Name] from Blue Dingo.

We're a licensed contractor specializing in make-ready and repair services for rental properties.

Could I leave some info and possibly schedule 10 minutes with the person who handles maintenance vendors?"`,
  },
  {
    id: 'pm-decision-maker',
    title: 'PM Decision Maker Opener',
    tag: 'PM',
    content: `"I appreciate the time.

We work with property managers on unit turnovers and repairs — paint, flooring, drywall, general maintenance.

Most PMs we talk to struggle with contractors who are unreliable. We've built our whole business around being the exception.

How are you currently handling your turnover work?"`,
  },
  {
    id: 'builder-job-site',
    title: 'Builder Job Site Opener',
    tag: 'Builder',
    content: `"Hey — are you the GC on this project?

I'm [Name] from Blue Dingo. We do finish work for builders: paint, flooring, tile.

Do you have 60 seconds? I just want to leave my card and learn more about what you work on."`,
  },
  {
    id: 'builder-phone',
    title: 'Builder Phone Opener',
    tag: 'Builder',
    content: `"Hi [Name], this is [Your Name] from Blue Dingo — licensed contractor in Phoenix.

We sub for GCs on finish work: paint, flooring, tile.

Quick question — do you currently use subs for that type of work on your projects?"`,
  },
  {
    id: 'pm-objections',
    title: '5 PM Objections',
    tag: 'PM',
    content: `1. "We have contractors."
→ "Would you try us on one turnover to compare?"

2. "Not interested."
→ "Can I leave my card for when things change?"

3. "Send an email."
→ "Of course — what types of work do you outsource most?"

4. "We do it in-house."
→ "Do you ever hit capacity? We're a great overflow option."

5. "How's pricing?"
→ "Competitive, transparent, written quotes upfront."`,
  },
  {
    id: 'builder-objections',
    title: '5 Builder Objections',
    tag: 'Builder',
    content: `1. "I have my guys."
→ "Do you ever get overloaded? We're great overflow."

2. "Licensed/insured?"
→ "Yes — ROC licensed, fully insured. Sending certs now."

3. "Had bad experiences."
→ "The only way to prove we're different is to do a job."

4. "Don't need anyone."
→ "Can I stay on your list for when things get busy?"

5. "How's availability?"
→ "We stay tight so we can respond fast. What's coming up?"`,
  },
  {
    id: 'power-questions',
    title: '5 Power Questions',
    tag: 'All',
    content: `1. "How do you handle [turnover/repair/finish] work currently?"

2. "What's been your biggest frustration with contractors?"

3. "What would you need to see to feel comfortable adding a new vendor?"

4. "How quickly do things typically need to happen?"

5. "If you could change one thing about your current contractor situation, what would it be?"`,
  },
  {
    id: 'listen-framework',
    title: 'The LISTEN Framework',
    tag: 'All',
    content: `L — Listen: Ask first, talk second

I — Identify: Find their real pain point

S — Share: Tell a story that addresses it

T — Test: "Does that sound like what you'd want?"

E — Earn: Get a clear, specific next step

N — Nurture: Follow up, stay visible, build trust`,
  },
];

export const WALK_IN_CHECKLIST = [
  'I know their company name',
  'I know roughly how many properties they manage',
  'I have a card or one-pager to leave',
  'I know what objection I might get and how I\'ll respond',
  'I have a clear ask ready (vendor list, follow-up, next step)',
];

export const SCENARIOS = [
  { value: 'pm_walkin', label: 'Property Management — Walk-in, first visit' },
  { value: 'pm_followup', label: 'Property Management — Follow-up call' },
  { value: 'builder_jobsite', label: 'Builder / GC — Job site approach' },
  { value: 'builder_phone', label: 'Builder / GC — Phone outreach' },
  { value: 'objection_practice', label: 'Objection Handling Practice' },
  { value: 'cold_call', label: 'Cold Call Practice' },
];

export const DIFFICULTIES = [
  { value: 'friendly', label: 'Friendly — Receptive prospect' },
  { value: 'neutral', label: 'Neutral — Guarded but polite' },
  { value: 'tough', label: 'Tough — Skeptical, busy, not interested' },
];

export const OBJECTIONS = [
  'We already have contractors',
  'We\'re not interested right now',
  'Send me an email',
  'We do it in-house',
  'How are your prices?',
  'We\'ve had bad experiences with subs',
  'Are you licensed and insured?',
  'We don\'t have budget right now',
  'I\'d need to talk to my boss',
  'We already have a preferred vendor for that',
];

export const DAILY_TIPS = [
  'The best salespeople ask more questions than they answer. Lead every conversation with curiosity.',
  'Your opener only needs to do one thing: earn the next 60 seconds.',
  'Rejection is redirection. Every "no" is teaching you something about your approach.',
  'Follow up is where most salespeople fail. Be the one who always follows through.',
  'People buy from people they trust. Trust is built through consistency, not charisma.',
  'Write down your best conversations and your worst ones. You grow faster by reviewing both.',
  'The goal of a first visit is never to close — it\'s to earn a reason for a second conversation.',
  'In property management sales, relationships are the product. The services come second.',
  'A slow, confident voice beats a fast, nervous one every time.',
  'If you don\'t ask for the next step, you\'re leaving the relationship to chance.',
  'Practice your opener so many times that it feels completely natural.',
  'The minute they say something about their frustration, stop talking and listen.',
  'Showing up consistently for 6 months beats the perfect sales pitch every time.',
  'You win GC relationships by being the sub who makes their life easier, not harder.',
  'Keep a running list of objections you hear. The ones that stump you are your homework.',
  'After every conversation, ask yourself: "Did I earn the next step?"',
  'Cold call reluctance is normal. The only cure is making more calls.',
  'Your goal for every visit: learn something you didn\'t know before you walked in.',
  'Body language speaks before you do. Walk in like you belong there.',
  'The best referrals come from existing clients who love working with you. Serve them first.',
  'A handwritten note after a first meeting gets remembered. Most salespeople don\'t bother.',
  'If they ask about price early, they\'re interested. That\'s a buying signal, not a rejection.',
  'Know your ROC license number and insurance carrier by heart. Don\'t fumble it.',
  'The LISTEN framework works because it makes the prospect feel heard. Everyone wants to feel heard.',
  '"I\'ll think about it" almost always means "you haven\'t convinced me yet." Ask what\'s missing.',
  'Check in on existing contacts even when you don\'t need anything. Relationships aren\'t transactions.',
  'Your first job with any client is your interview. Make it count.',
  'Never talk badly about competitors. It makes you look small.',
  'A confident, specific close beats a vague, hopeful one: "Can I get on your vendor list?" not "So... would you ever use us?"',
  'The streak matters. Even on days you don\'t feel like it — make one call, visit one contact.',
];
