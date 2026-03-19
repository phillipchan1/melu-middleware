const express = require('express');
const cors = require('cors');
require('dotenv').config();

const personalizationRouter = require('./src/routes/personalization');
const onboardingRouter = require('./src/routes/onboarding');
const profileRouter = require('./src/routes/profile');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedPatterns = (process.env.ALLOWED_ORIGIN_PATTERNS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => new RegExp(p));

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return allowedPatterns.some((re) => re.test(origin));
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, origin || true);
    } else {
      cb(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Melu Middleware API',
    version: '1.0.0',
    description: 'Backend API for the Melu meal planning application',
    endpoints: {
      health: '/health',
      api: '/api',
      personalizationRespond: '/api/personalization/respond',
      onboardingSubmit: '/api/onboarding/submit',
      profileChefCard: '/api/profile/chef-card',
    },
  });
});

app.use('/api/personalization', personalizationRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/profile', profileRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({
    error: 'Internal Server Error',
    details: err.message,
  });
});

// Export for Vercel serverless; only listen when running locally
module.exports = app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Melu Middleware API running on port ${PORT}`);
  });
}
