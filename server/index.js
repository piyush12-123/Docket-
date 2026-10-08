import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import notificationsRouter from './routes/notifications.js';
import dashboardRouter from './routes/dashboard.js';
import settingsRouter from './routes/settings.js';
import { startAlertCron } from './jobs/alertJob.js';

dotenv.config();

const app = express();

// Security & logging middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.use('/api/auth', authRouter);

// Documents routes
app.use('/api/documents', documentsRouter);

// Notifications routes
app.use('/api/notifications', notificationsRouter);

// Dashboard routes
app.use('/api/dashboard', dashboardRouter);

// Settings routes
app.use('/api/settings', settingsRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

export { app };

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  startAlertCron();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Only start the server when this file is run directly (not when imported by tests)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  start();
}
