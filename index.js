const express = require('express');
const cors = require('cors');
require('dotenv').config();

const personalizationRouter = require('./src/routes/personalization');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
    },
  });
});

app.use('/api/personalization', personalizationRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Melu Middleware API running on port ${PORT}`);
});
