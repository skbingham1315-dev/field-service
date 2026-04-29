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

// Stricter limit for auth endpoints — 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/portal/auth', authLimiter);

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

// ─── Clamp ?limit param to prevent DoS via huge page sizes ───────────────────
app.use((req, _res, next) => {
  if (req.query.limit) {
    const n = parseInt(req.query.limit as string, 10);
    req.query.limit = String(Math.min(isNaN(n) ? 50 : n, 200));
  }
  next();
});

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
