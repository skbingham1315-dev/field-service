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
    readTime: '4 min',
    exerciseIds: ['e1', 'e2', 'e3'],
    content: `## About Blue Dingo LLC

Blue Dingo LLC is a licensed construction and remodeling company based in the Phoenix, Arizona metro area. We specialize in property maintenance, repairs, and renovation services for residential and commercial clients. Our clients range from individual homeowners to large property management companies overseeing hundreds of units.

---

## Our Core Services

- General repairs and handyman services (drywall, doors, windows, fixtures)
- Interior and exterior painting
- Flooring installation and replacement (tile, LVP, carpet)
- Bathroom renovations and remodels
- Make-ready and unit turnover services for rental properties
- Kitchen updates and improvements
- Landscaping and exterior maintenance coordination
- Permit-required construction and remodeling projects

---

## What Makes Blue Dingo Different

**Licensed & Insured** — We carry proper licensing and insurance. Property managers never have to worry about liability.

**Responsive** — We communicate clearly and show up when we say we will. That is rarer than it sounds.

**Full Service** — From a broken door hinge to a full bathroom gut, we handle it all under one vendor relationship.

**Documentation** — Every job is documented with photos, work orders, and invoices. Easy for PM record keeping.

**Phoenix Market** — We know the Valley. We understand HOA rules, city permit requirements, and local vendors.

**Honest Pricing** — No hidden charges. Scope is agreed before work begins and we stick to it.

---

## Your Belief Statement

You are not just selling a service. You are offering a solution to people who are tired of unreliable contractors, missed calls, and sloppy work.

Blue Dingo shows up, does the job right, and makes the property manager or builder look good to their clients. **That is the real value.**`,
  },
  {
    id: 's2',
    number: 2,
    title: 'Property Management Playbook',
    description: 'Walk-in approach, scripts, and objection handling for PM companies',
    readTime: '7 min',
    exerciseIds: ['e4', 'e5', 'e6'],
    content: `## Understanding the Property Manager

Property managers are busy, skeptical, and burned by contractors constantly. The person at the front desk has heard every pitch. Your job is NOT to pitch — your job is to have a real conversation and solve a real problem they are already dealing with.

**What They Deal With Every Day:**
- Work orders piling up with no reliable contractor to send them to
- Vendors who quote one price and charge another
- Contractors who no-show or go silent mid-job
- Tenants calling angry because repairs are not getting done
- Owners breathing down their neck about property condition
- Turnover units sitting vacant because make-readies take too long

> **The Golden Insight:** A property manager does not care how good you are at drywall. They care that when they send you a work order at 8am, it gets handled and they never have to think about it again. THAT is what you are selling.

---

## Before You Walk In

- Look up the company online. How many properties or units do they manage?
- Check their Google reviews. Do tenants complain about slow maintenance? That is your opening.
- Find the name of their maintenance coordinator or property manager if possible.
- Bring a one-page company overview or business card. Look professional.

---

## The Walk-In Approach

**Step 1 — The Opening (at the front desk)**

> "Hi, my name is [Your Name] with Blue Dingo LLC. We are a licensed contractor here in the Valley and I just wanted to stop in and introduce myself. Is there a maintenance coordinator or someone who manages your vendor relationships I could say hello to for just a couple minutes?"

**Pro Tip:** Do NOT ask for a lot of their time. Ask for two minutes. People say yes to two minutes. If they like you, it turns into ten.

---

**Step 2 — The Conversation (with the decision maker)**

> "Thanks for taking a minute. I am not here to do a whole pitch — I just wanted to introduce myself and let you know we are available. We do repairs, paint, flooring, make-readies, bathrooms — pretty much anything that comes up on a property. We are local, licensed, and insured. Are you happy with all your current vendors, or are there any trades where you find yourself scrambling to find someone?"

Listen. Let them talk. Whatever problem they mention — that is your foot in the door.

---

**Step 3 — The Ask**

> "I would love to earn a spot on your preferred vendor list. Even if you do not need us today, I just want to be the person you call when something comes up. Can I leave you our info? And is there a vendor packet or onboarding form I should fill out to get on your list?"

---

## Objection Handling — Property Managers

**"We already have contractors."**
> "Totally understand — most companies do. We are not trying to replace anyone. We just want to be the backup when someone is unavailable or when you have overflow work. Mind if I leave our card?"

**"We do not take walk-ins."**
> "No problem at all — I just wanted to drop off our info. Who would be the best person to email or reach out to officially?"

**"We need references."**
> "Absolutely, I can get those to you. Would email work? And is there a specific trade or type of job you are looking for help with right now?"

**"We use a preferred vendor portal."**
> "Great — can you point me to where I sign up? I will get our insurance and license submitted today."

**"We do not have any openings."**
> "Understood. Situations change fast in property management. Mind if I check back in a month or two? Or is there a slow season where you tend to have more turnover work?"

---

## The Follow-Up System

Walking in is only the start. Most sales happen on the 5th to 8th touchpoint.

| Day | Action |
|---|---|
| Day 1 | Walk in, drop off card, log it with notes on what you learned |
| Day 3 | Send a short, friendly email. Reference your visit. Attach our one-pager. |
| Day 10 | Call the office. Ask if they received your info. Ask if anything has come up. |
| Day 30 | Check back in. Spring and Fall are high-turnover times. |
| Ongoing | Every 30–45 days until they say yes or do not contact. |

**Track everything.** Log every visit, call, and email. Note everyone you talked to, what they said, and when to follow up. The person who stays organized wins the long game.`,
  },
  {
    id: 's3',
    number: 3,
    title: 'Builder & Contractor Playbook',
    description: 'Job site approach, phone outreach, and GC relationship building',
    readTime: '6 min',
    exerciseIds: ['e7', 'e8', 'e9'],
    content: `## Understanding Builders and General Contractors

Builders and GCs are different from property managers. They are project-focused, under constant deadline pressure, and they measure everything in dollars and schedules. They need subs who make their life easier, not harder.

**What They Need From a Sub:**
- Show up exactly when scheduled. Not early. Not late. On time.
- Do quality work that passes inspection first time.
- Communicate proactively — if there is a problem, call before it becomes their problem.
- Price competitively without nickel-and-diming.
- Handle permits and paperwork correctly.
- Be someone they can call again on the next job.

> **The Key Difference:** Property managers send you ongoing work orders. Builders give you project-based work. One relationship with a mid-size builder can mean $50,000+ in a single year. Take your time, build trust, and treat every builder job as an audition for the next ten.

---

## How to Find Builders

- **Arizona Permit Pro** — pull recent permit filings to find active builders in the area
- Drive new construction neighborhoods and look for GC signage on job sites
- ASBA and local homebuilder associations
- Angi, Houzz, and BuildZoom — look at GC profiles with high review counts
- Drive commercial strips and look for renovation project signage

---

## The Job Site Approach

> "Hey, who is the GC on this project? I am with Blue Dingo LLC — we do finish work, paint, flooring, and tile. We are local and we are looking to build a relationship with a solid general. Is he or she around?"

**To the GC directly:**
> "Hey, I do not want to hold you up at all. I just wanted to introduce myself. We are a licensed contractor looking to work as a sub on projects like this. What trades are you usually scrambling to fill?"

---

## The Office or Phone Approach

> "Hi, I am looking for [GC Name] or whoever handles subcontractor relationships. My name is [Your Name] with Blue Dingo LLC. We are a licensed contractor in the Phoenix area and we are looking to get on your bid list for upcoming projects. Would that be something I could submit our info for?"

---

## Objection Handling — Builders

**"We have all our subs covered."**
> "Completely understand. What trades do you find yourself using the most? I just want to be a backup for when someone is overloaded or unavailable."

**"We need to see your work first."**
> "Fair enough — we can do a small job or even a walkthrough of recent completed work. What would give you the most confidence?"

**"Your price is too high."**
> "Help me understand what you are comparing it to and I will see what we can do. I would rather match what makes sense for the project than lose a good relationship over a number."

**"We do not use new subs mid-project."**
> "Totally makes sense. Can I get on your list for the next project? I would love to bid it properly from the start."

**"I need someone available tomorrow."**
> "Let me check and call you right back. We pride ourselves on being responsive — that is actually something we are known for."`,
  },
  {
    id: 's4',
    number: 4,
    title: 'Core Selling Skills — The LISTEN Framework',
    description: 'The fundamentals that separate good salespeople from great ones',
    readTime: '5 min',
    exerciseIds: ['e10', 'e11'],
    content: `## The LISTEN Framework

Most salespeople talk too much. The best ones listen. Use this framework in every conversation:

**L — Lead with curiosity**
Ask questions before making any claim. "What does your current maintenance process look like?"

**I — Identify the real pain**
The first thing they say is rarely the real problem. Ask follow-up questions.

**S — Summarize what you heard**
"So it sounds like the biggest challenge is turnover timing — is that right?"

**T — Tie it to what we do**
"That is actually exactly what we specialize in — fast make-ready turnarounds."

**E — Explain the outcome**
"Our clients typically get units back on the rental market 5–10 days faster."

**N — Next step**
Always end with a clear next step. Send info, schedule a call, get on the vendor list.

---

## Questions That Open Doors

Memorize these. Use them naturally. They get people talking.

1. "What does your current process look like for maintenance work orders?"
2. "What is the biggest headache you deal with when it comes to contractors?"
3. "How long does it typically take you to get a unit turned over right now?"
4. "What would need to be true for you to add someone to your vendor list?"
5. "If I could solve [their problem], would that be worth a conversation?"
6. "What has worked well with contractors in the past — and what has not?"

---

## Body Language & First Impressions

**Dress** — Clean, professional, not overdressed. Collared shirt, clean pants or jeans, clean shoes. You are a contractor — dress like a successful one.

**Eye contact** — Make it. Hold it naturally. Nothing signals confidence more.

**Smile** — Genuine warmth opens every door. Be someone they are glad showed up.

**Handshake** — Firm, brief, professional. Look them in the eye when you do it.

**Phone** — Away. Not in your hand. Not glancing at it. Give them your full attention.

**Tone** — Calm and confident. Not eager or desperate. You are not asking for a favor — you are offering a solution.`,
  },
  {
    id: 's5',
    number: 5,
    title: 'Personal Growth Plan',
    description: 'Weekly review habits, rejection handling, and performance benchmarks',
    readTime: '5 min',
    exerciseIds: ['e12', 'e13', 'e14'],
    content: `## The Weekly Review Habit

Every Friday, take 15 minutes and answer these questions:

1. How many new contacts did I make this week?
2. How many follow-ups did I complete?
3. What objection tripped me up this week?
4. What worked really well that I should keep doing?
5. What one thing would have made this week more productive?

---

## Monthly Performance Benchmarks

| Phase | Target |
|---|---|
| Week 1–2 | 15+ new contacts made, vendor applications submitted, getting comfortable with the pitch |
| Month 1 | 3–5 warm relationships, at least 1 trial job or callback scheduled |
| Month 3 | 2–3 active accounts sending regular work orders |
| Month 6 | Consistent pipeline, personal conversion rate tracked, referrals starting to come in |

---

## Handling Rejection

In sales, "no" almost always means "not right now" or "not enough trust yet." A property manager who turns you down today can become your best account in six months if you stay professional, follow up consistently, and never make them feel pressured. **The fortune is in the follow-up.**

- Never take rejection personally. It is never about you — it is about timing and trust.
- A "no" with a follow-up date is not a no. It is a future yes.
- Track your ratios. If 1 in 10 becomes a client, you just need to talk to more people.
- Debrief every rejection. What could you have done differently? What did you learn?

---

## Books & Resources to Study

- **Never Split the Difference** — Chris Voss (negotiation and listening skills)
- **The Go-Giver** — Bob Burg (relationship-based selling)
- **Fanatical Prospecting** — Jeb Blount (staying consistent in outreach)
- **SPIN Selling** — Neil Rackham (asking the right questions)`,
  },
  {
    id: 's6',
    number: 6,
    title: 'Quick Reference Card',
    description: 'All key scripts and questions — study before every visit',
    readTime: '2 min',
    exerciseIds: [],
    content: `## Our Services at a Glance

| Trade | What We Do |
|---|---|
| Repairs | Drywall, doors, windows, fixtures, general handyman |
| Painting | Interior & exterior, units, common areas |
| Flooring | Tile, LVP, carpet, subfloor repair |
| Bathrooms | Full remodels, fixture swaps, tile, vanities |
| Make-Readies | Full unit turnover, cleaning coordination, repairs |
| Construction | Permitted remodels, additions, structural work |

---

## PM Opening Line (Front Desk)

> "Hi, I am [Name] with Blue Dingo LLC. We are a licensed contractor in the Valley. Is there someone who handles your vendor relationships I could say hello to for just two minutes?"

---

## Builder Opening Line (Job Site or Office)

> "Hey, I am [Name] with Blue Dingo. We do finish work, paint, flooring, and tile. We are looking to build a relationship with a solid GC. Are you the right person to talk to about getting on your bid list?"

---

## The Five Questions to Always Have Ready

1. "What does your current process look like for handling work orders?"
2. "What trades do you find hardest to fill right now?"
3. "How long does it typically take you to turn a unit?"
4. "What would I need to do to earn a spot on your vendor list?"
5. "Who should I follow up with — is that you, or someone else?"

---

## Your Daily Reminder

You are representing a company that does quality work, shows up on time, and treats people with respect. Walk in with your head up. You are not asking for charity — you are offering a service that makes their life easier. Believe that, and they will believe it too.`,
  },
];

export const EXERCISES: TrainingExercise[] = [
  { id: 'e1', sectionId: 's1', number: 1, question: 'In your own words, how would you describe Blue Dingo to someone who has never heard of us?' },
  { id: 'e2', sectionId: 's1', number: 2, question: 'What are the three things you think a property manager cares about most when hiring a contractor? Why?' },
  { id: 'e3', sectionId: 's1', number: 3, question: 'Write down one reason you personally believe Blue Dingo is worth calling. Make it genuine.' },
  { id: 'e4', sectionId: 's2', number: 4, question: "A property manager tells you: 'We have been with our contractor for 8 years and we are happy.' Write your response below." },
  { id: 'e5', sectionId: 's2', number: 5, question: 'You walk into an office and the receptionist says the manager is in a meeting and cannot be disturbed. What do you do and say?' },
  { id: 'e6', sectionId: 's2', number: 6, question: 'What is the ONE pain point you think most property managers in Phoenix have right now? How would you open a conversation around it?' },
  { id: 'e7', sectionId: 's3', number: 7, question: "A builder says: 'I tried a new sub once and they bailed halfway through the job. I do not take chances anymore.' How do you respond?" },
  { id: 'e8', sectionId: 's3', number: 8, question: 'You are at a job site and the GC has 30 seconds before he has to take a call. What is your pitch in 30 seconds?' },
  { id: 'e9', sectionId: 's3', number: 9, question: 'What are TWO specific things you could do this week to find and contact a builder or GC who might need our services?' },
  { id: 'e10', sectionId: 's4', number: 10, question: 'Practice the LISTEN framework with a friend. Have them play a skeptical property manager. Write down how the conversation went and what you would do differently.' },
  { id: 'e11', sectionId: 's4', number: 11, question: 'What is your natural sales strength? What is the area you need to grow the most in? Be honest.' },
  { id: 'e12', sectionId: 's5', number: 12, question: 'Set a personal goal for your first 30 days. How many contacts will you make? How many follow-ups? What does success look like to you?' },
  { id: 'e13', sectionId: 's5', number: 13, question: 'Think about a time you were sold something and it felt good. What did the salesperson do that made it feel that way? How can you bring that into what you do?' },
  { id: 'e14', sectionId: 's5', number: 14, question: 'What scares you most about walking into an office cold? Write it down, then write one way you can face that fear this week.' },
];

export const QUICK_REF_CARDS: QuickRefCard[] = [
  {
    id: 'pm-front-desk',
    title: 'PM Front Desk Opener',
    tag: 'PM',
    content: `"Hi, my name is [Your Name] with Blue Dingo LLC. We are a licensed contractor here in the Valley and I just wanted to stop in and introduce myself. Is there a maintenance coordinator or someone who manages your vendor relationships I could say hello to for just a couple minutes?"

PRO TIP: Ask for two minutes. People say yes to two minutes. If they like you, it turns into ten.`,
  },
  {
    id: 'pm-decision-maker',
    title: 'PM Decision Maker Opener',
    tag: 'PM',
    content: `"Thanks for taking a minute. I am not here to do a whole pitch — I just wanted to introduce myself and let you know we are available.

We do repairs, paint, flooring, make-readies, bathrooms — pretty much anything that comes up on a property. We are local, licensed, and insured.

Are you happy with all your current vendors, or are there any trades where you find yourself scrambling to find someone?"

Then LISTEN. Whatever they mention — that is your foot in the door.`,
  },
  {
    id: 'pm-vendor-ask',
    title: 'PM Vendor List Ask',
    tag: 'PM',
    content: `"I would love to earn a spot on your preferred vendor list. Even if you do not need us today, I just want to be the person you call when something comes up.

Can I leave you our info? And is there a vendor packet or onboarding form I should fill out to get on your list?"`,
  },
  {
    id: 'builder-job-site',
    title: 'Builder Job Site Opener',
    tag: 'Builder',
    content: `"Hey, who is the GC on this project? I am with Blue Dingo LLC — we do finish work, paint, flooring, and tile. We are local and we are looking to build a relationship with a solid general. Is he or she around?"

To the GC directly: "Hey, I do not want to hold you up at all. I just wanted to introduce myself. We are a licensed contractor looking to work as a sub on projects like this. What trades are you usually scrambling to fill?"`,
  },
  {
    id: 'builder-phone',
    title: 'Builder Phone / Office Opener',
    tag: 'Builder',
    content: `"Hi, I am looking for [GC Name] or whoever handles subcontractor relationships. My name is [Your Name] with Blue Dingo LLC.

We are a licensed contractor in the Phoenix area and we are looking to get on your bid list for upcoming projects. Would that be something I could submit our info for?"`,
  },
  {
    id: 'pm-objections',
    title: 'PM Objections',
    tag: 'PM',
    content: `"We already have contractors."
→ "We just want to be the backup when someone is unavailable. Mind if I leave our card?"

"We do not take walk-ins."
→ "Who is the best person to email or reach out to officially?"

"We need references."
→ "Absolutely. What type of job are you looking for help with right now?"

"We use a preferred vendor portal."
→ "Can you point me to where I sign up? I will get our insurance submitted today."

"We do not have any openings."
→ "Mind if I check back in a month or two?"`,
  },
  {
    id: 'builder-objections',
    title: 'Builder Objections',
    tag: 'Builder',
    content: `"We have all our subs covered."
→ "I just want to be backup for when someone is overloaded or unavailable."

"We need to see your work first."
→ "Fair enough. What would give you the most confidence?"

"Your price is too high."
→ "Help me understand what you are comparing it to."

"We do not use new subs mid-project."
→ "Totally makes sense. Can I get on your list for the next project?"

"I need someone available tomorrow."
→ "Let me check and call you right back. We pride ourselves on being responsive."`,
  },
  {
    id: 'listen-framework',
    title: 'The LISTEN Framework',
    tag: 'All',
    content: `L — Lead with curiosity
Ask questions before making any claim.

I — Identify the real pain
The first thing they say is rarely the real problem.

S — Summarize what you heard
"So it sounds like the biggest challenge is turnover timing — is that right?"

T — Tie it to what we do
"That is exactly what we specialize in."

E — Explain the outcome
"Our clients typically get units back on the market 5–10 days faster."

N — Next step
Always end with a clear, specific next step.`,
  },
  {
    id: 'five-questions',
    title: 'The 5 Questions',
    tag: 'All',
    content: `1. "What does your current process look like for handling work orders?"

2. "What trades do you find hardest to fill right now?"

3. "How long does it typically take you to turn a unit?"

4. "What would I need to do to earn a spot on your vendor list?"

5. "Who should I follow up with — is that you, or someone else?"`,
  },
];

export const WALK_IN_CHECKLIST = [
  'I know the company name and roughly how many units they manage',
  'I checked their Google reviews for contractor complaints',
  'I have a business card or one-pager to leave',
  'I know my front desk opener cold',
  'I have prepared for at least one objection',
  'I have a clear ask ready (vendor list, follow-up, next step)',
  'My phone is on silent and put away',
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
  "We have been with our contractor for 8 years and we are happy",
  'We already have contractors we work with',
  'We are not interested right now',
  'Send me an email',
  'We do it in-house',
  'How are your prices?',
  'We need references',
  'We use a preferred vendor portal',
  "I tried a new sub once and they bailed halfway through the job",
  "We need to see your work first",
  'Are you licensed and insured?',
  'We do not have budget right now',
  'I need someone available tomorrow',
  'We do not take walk-ins',
];

export const DAILY_TIPS = [
  'The best salespeople ask more questions than they answer. Lead every conversation with curiosity.',
  'Your opener only needs to do one thing: earn the next 60 seconds.',
  'Rejection is redirection. Every "no" is teaching you something about your approach.',
  'Follow up is where most salespeople fail. Be the one who always follows through.',
  'People buy from people they trust. Trust is built through consistency, not charisma.',
  'Write down your best conversations and your worst ones. You grow faster by reviewing both.',
  'The goal of a first visit is never to close — it is to earn a reason for a second conversation.',
  'In property management sales, relationships are the product. The services come second.',
  'A slow, confident voice beats a fast, nervous one every time.',
  'If you do not ask for the next step, you are leaving the relationship to chance.',
  'Practice your opener so many times that it feels completely natural.',
  'The minute they mention a frustration, stop talking and listen.',
  'Showing up consistently for 6 months beats the perfect sales pitch every time.',
  'You win GC relationships by being the sub who makes their life easier, not harder.',
  'Keep a running list of objections you hear. The ones that stump you are your homework.',
  'After every conversation, ask yourself: Did I earn the next step?',
  'Cold call reluctance is normal. The only cure is making more calls.',
  'Your goal for every visit: learn something you did not know before you walked in.',
  'Body language speaks before you do. Walk in like you belong there.',
  'The best referrals come from existing clients who love working with you. Serve them first.',
  'A handwritten note after a first meeting gets remembered. Most salespeople do not bother.',
  'If they ask about price early, they are interested. That is a buying signal, not a rejection.',
  'Know your ROC license number and insurance carrier by heart. Do not fumble it.',
  'The LISTEN framework works because it makes the prospect feel heard. Everyone wants to feel heard.',
  'I will think about it almost always means you have not convinced me yet. Ask what is missing.',
  'Check in on existing contacts even when you do not need anything. Relationships are not transactions.',
  'Your first job with any client is your interview. Make it count.',
  'Never talk badly about competitors. It makes you look small.',
  'A confident, specific close beats a vague one: "Can I get on your vendor list?" not "Would you ever use us?"',
  'The streak matters. Even on days you do not feel like it — make one call, visit one contact.',
];
