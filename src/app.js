import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requestContextMiddleware, httpLogger } from './middlewares/request.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import healthRoutes from './routes/health.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import authRoutes from './routes/auth.routes.js';
import zoomRoutes from './routes/zoom.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()) : true,
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(requestContextMiddleware);
app.use(httpLogger);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Doctor Scheduler Backend is running',
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    }
  });
});

app.use(healthRoutes);
app.use(doctorRoutes);
app.use(appointmentRoutes);
app.use(calendarRoutes);
app.use(authRoutes);
app.use(zoomRoutes);
app.use(webhookRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
