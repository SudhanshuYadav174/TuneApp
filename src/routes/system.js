/**
 * routes/system.js
 * Health checks and system status.
 */
const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/system/status', (req, res) => {
  res.json({
    name: 'TuneCraft API',
    version: '1.0.0',
    status: 'operational',
    node: process.version,
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;

