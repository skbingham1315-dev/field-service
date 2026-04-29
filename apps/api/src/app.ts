import express from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { authRouter } from './routes/auth';
import { tenantsRouter } from './routes/tenants';
import { usersRouter } from './routes/users';
import { customersRouter } from './routes/customers';
import { jobsRouter } from './routes/jobs';
import { invoicesRouter } from './routes/invoices';
import { scheduleRouter } from './routes/schedule';
import { webhooksRouter } from './routes/webhooks';
import { uploadsRouter } from './routes/uploads';
import { reportsRouter } from './routes/reports';
import { estimatesRouter } from './routes/estimates';
import { salesRouter } from './routes/sales';
import { reviewsRouter } from './routes/reviews';
import { aiRouter } from './routes/ai';
import { billingRouter } from './routes/billing';
import { timeEntriesRouter } from './routes/time-entries';
import { payrollRouter } from './routes/payroll';
import { notificationsRouter } from './routes/notifications';
import { contactsRouter } from './routes/contacts';
import { crmJobsRouter } from './routes/crm-jobs';
import { subcontractorsRouter } from './routes/subcontractors';
import { compensationRouter } from './routes/compensation';
import { portalRouter } from './routes/portal';
import { propertiesRouter } from './routes/properties';
import { squareRouter } from './routes/square';
import { exportRouter } from './routes/export';
import bcrypt from 'bcryptjs';
import { prisma as _p } from '@fsp/db';

export const app = express();

// Trust Railway's proxy so rate-limit / IP detection works correctly
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.basemaps.cartocdn.com",
        "https://*.tile.openstreetmap.org",
        "https://unpkg.com",
      ],
      connectSrc: ["'self'", "wss:", "ws:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "https://www.google.com"],
    },
  },
}));
app.use(
  cors({
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Body parsing ────────────────────────────────────────────────────────────
// Raw body needed for Stripe webhooks — register before json()
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
const apiV1 = express.Router();
apiV1.use('/auth', authRouter);
apiV1.use('/tenants', tenantsRouter);
apiV1.use('/users', usersRouter);
apiV1.use('/customers', customersRouter);
apiV1.use('/jobs', jobsRouter);
apiV1.use('/invoices', invoicesRouter);
apiV1.use('/schedule', scheduleRouter);
apiV1.use('/uploads', uploadsRouter);
apiV1.use('/reports', reportsRouter);
apiV1.use('/estimates', estimatesRouter);
apiV1.use('/sales', salesRouter);
apiV1.use('/reviews', reviewsRouter);
apiV1.use('/ai', aiRouter);
apiV1.use('/billing', billingRouter);
apiV1.use('/time-entries', timeEntriesRouter);
apiV1.use('/payroll', payrollRouter);
apiV1.use('/notifications', notificationsRouter);
apiV1.use('/contacts', contactsRouter);
apiV1.use('/crm-jobs', crmJobsRouter);
apiV1.use('/subcontractors', subcontractorsRouter);
apiV1.use('/compensation', compensationRouter);
apiV1.use('/portal', portalRouter);
apiV1.use('/properties', propertiesRouter);
apiV1.use('/square', squareRouter);
apiV1.use('/export', exportRouter);

app.use('/api/v1', apiV1);
app.use('/webhooks', webhooksRouter);

// ─── TEMPORARY admin fix route — remove after use ─────────────────────────────
app.post('/_admin/fix-user', async (req: any, res: any) => {
  if (req.body?.secret !== process.env.ADMIN_FIX_SECRET) return res.status(403).json({ error: 'forbidden' });
  const { email, newPassword } = req.body;
  const user = await _p.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { tenant: true } });
  if (!user) return res.json({ found: false });
  const updates: any = { status: 'active', inviteToken: null };
  if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12);
  await _p.user.update({ where: { id: user.id }, data: updates });
  if (['suspended','cancelled'].includes(user.tenant?.status ?? '')) {
    await _p.tenant.update({ where: { id: user.tenantId }, data: { status: 'active' } });
  }
  res.json({ fixed: true, email: user.email, role: user.role, tenantStatus: user.tenant?.status });
});

// ─── Serve frontend in production ────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  // process.cwd() = /app/apps/api when started via nixpacks start cmd
  const webDist = path.resolve(process.cwd(), '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res, next) => {
      const index = path.join(webDist, 'index.html');
      res.sendFile(index, (err) => { if (err) next(err); });
    });
  }
}

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);
