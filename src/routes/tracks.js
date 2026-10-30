/**
 * routes/tracks.js
 * High-performance audio stream URL extraction without YouTube API key.
 * Uses @distube/ytdl-core with automatic format fallback.
 */
const express = require('express');
const { Ytdl, Client } = require('@distube/ytdl-core');
const yts = require('yt-search');
const router = express.Router();

// Initialize Ytdl with Tv and VisionOS clients to ensure zero datacenter IP blocks and direct M4A streaming
const ytdlClient = new Ytdl({
  clients: [Client.Tv, Client.VisionOS, Client.WebEmbedded],
});

// Stream URL cache
const streamCache = new Map();
const STREAM_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function getCached(key) {
  const entry = streamCache.get(key);
  if (entry && Date.now() - entry.ts < STREAM_CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  streamCache.set(key, { data, ts: Date.now() });
  if (streamCache.size > 300) {
    const firstKey = streamCache.keys().next().value;
    streamCache.delete(firstKey);
  }
}

// GET /api/tracks/:id/audio - Direct streaming audio proxy
router.get('/:id/audio', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Track ID required' });

    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    
    // Choose audio format (prefers standard AAC/m4a audio for universal compatibility)
    const stream = ytdlClient.download(videoUrl, {
      filter: (format) => format.hasAudio && !format.hasVideo,
      quality: 'highestaudio',
      highWaterMark: 1 << 23, // 8MB buffer
    });

    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    stream.on('error', (err) => {
      console.error(`Audio proxy stream error [${id}]:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error', message: err.message });
      }
    });

    req.on('close', () => {
      stream.destroy();
    });

    stream.pipe(res);
  } catch (err) {
    console.error(`Audio proxy route error [${req.params.id}]:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio', message: err.message });
    }
  }
});

// GET /api/tracks/:id/stream - Returns direct M4A audio stream URL
router.get('/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Track ID required' });

    const cached = getCached(id);
    if (cached) return res.json({ url: cached, cached: true });

    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    const info = await ytdlClient.getInfo(videoUrl);

    // Filter audio formats, prefer M4A/MP4 for universal mobile compatibility
    const audioFormats = info.formats.filter(
      (f) => f.hasAudio && (!f.hasVideo || f.mimeType?.includes('audio'))
    );

    const m4a = audioFormats.find((f) => f.mimeType?.includes('mp4') && f.url);
    const best = m4a || audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0] || info.formats.find(f => f.url);

    if (!best || !best.url) {
      return res.status(404).json({ error: 'No audio stream available' });
    }

    setCache(id, best.url);

    res.json({
      url: best.url,
      quality: best.audioBitrate ? `${best.audioBitrate}kbps` : 'standard',
      mimeType: best.mimeType || 'audio/mp4',
    });
  } catch (err) {
    console.error(`Stream error [${req.params.id}]:`, err.message);
    res.status(500).json({ error: 'Failed to get stream URL', message: err.message });
  }
});

// GET /api/tracks/trending
router.get('/trending', async (req, res) => {
  try {
    const queries = ['top hits 2024', 'popular music hits', 'trending songs english'];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    const result = await yts(randomQuery);
    const songs = result.videos.slice(0, 20).map((v) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author?.name || 'Unknown Artist',
      thumbnail: v.thumbnail,
      duration: v.seconds,
      views: v.views?.toLocaleString(),
    }));
    res.json({ results: songs });
  } catch (err) {
    console.error('Trending error:', err.message);
    res.status(500).json({ error: 'Failed to get trending tracks' });
  }
});

module.exports = router;
