/**
 * TuneCraft Backend - Main Server
 * Provides music search and streaming via yt-search + ytdl-core.
 * No YouTube API key required for basic streaming!
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const searchRoutes = require('./routes/search');
const trackRoutes = require('./routes/tracks');
const systemRoutes = require('./routes/system');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({ origin: '*' }));
app.use(compression({
  filter: (req, res) => {
    if (req.path.includes('/audio')) return false; // don't compress audio streams
    return compression.filter(req, res);
  }
}));
app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/search', searchRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api', systemRoutes);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'TuneCraft API',
    version: '1.0.0',
    status: 'running',
    endpoints: ['/api/search', '/api/tracks', '/api/health'],
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🎵 TuneCraft Backend running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api\n`);
});

