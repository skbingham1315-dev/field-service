import express from 'express';
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

export const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
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

app.use('/api/v1', apiV1);
app.use('/webhooks', webhooksRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);
