/**
 * routes/tracks.js
 * High-performance audio stream URL extraction without YouTube API key.
 * Multi-tier extraction: Direct VisionOS InnerTube + @distube/ytdl-core fallback.
 */
const express = require('express');
const { Ytdl } = require('@distube/ytdl-core');
const yts = require('yt-search');
const router = express.Router();

// Fallback Ytdl client using default robust multi-client chain (visionos, web_embedded, tv, mweb, web_creator)
const ytdlClient = new Ytdl({
  cookie: process.env.YT_COOKIE || undefined,
});

// Stream URL cache
const streamCache = new Map();
const STREAM_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

let cachedVisitorData = null;
let visitorDataTime = 0;

async function getVisitorData() {
  if (cachedVisitorData && Date.now() - visitorDataTime < 60 * 60 * 1000) {
    return cachedVisitorData;
  }
  try {
    const vRes = await fetch('https://www.youtube.com/sw.js_data', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      },
      signal: AbortSignal.timeout(4000),
    });
    const vText = await vRes.text();
    const vJson = JSON.parse(vText.replace(/^\)\]\}'\s*/, ''));
    cachedVisitorData = vJson[0][2][0][0][13];
    visitorDataTime = Date.now();
    return cachedVisitorData;
  } catch (e) {
    console.warn('Visitor data fetch warning:', e.message);
    return null;
  }
}

async function extractVisionOS(videoId) {
  const visitorData = await getVisitorData();
  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'X-YouTube-Client-Name': '101',
      'X-YouTube-Client-Version': '1.02',
      Origin: 'https://www.youtube.com',
      Cookie: 'SOCS=CAI',
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
          hl: 'en',
          gl: 'US',
          utcOffsetMinutes: 0,
          ...(visitorData ? { visitorData } : {}),
        },
      },
      videoId: videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
        },
      },
    }),
    signal: AbortSignal.timeout(6000),
  });

  const pData = await playerRes.json();
  const formats = (pData.streamingData?.adaptiveFormats || []).filter(
    (f) => f.mimeType && f.mimeType.includes('audio')
  );
  const m4a = formats.find((f) => f.mimeType.includes('mp4') && f.url);
  const best = m4a || formats.find((f) => f.url);

  if (!best || !best.url) {
    const reason = pData.playabilityStatus?.reason || pData.playabilityStatus?.status || 'Unknown status';
    throw new Error(`VisionOS stream unavailable: ${reason}`);
  }

  return {
    url: best.url,
    quality: best.bitrate ? `${Math.round(best.bitrate / 1000)}kbps` : 'standard',
    mimeType: best.mimeType || 'audio/mp4',
  };
}

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

// GET /api/tracks/visitor-id - Returns fresh YouTube visitor token for mobile devices
router.get('/visitor-id', async (req, res) => {
  try {
    const visitorData = await getVisitorData();
    if (visitorData) {
      return res.json({ visitorData });
    }
    return res.status(503).json({ error: 'Visitor data unavailable' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tracks/:id/audio - High-speed audio streaming proxy
// Solves YouTube IP binding and rate limiting by proxying through server's signed connection
router.get('/:id/audio', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).send('Track ID required');

  try {
    let streamUrl = getCached(id);
    if (!streamUrl) {
      try {
        const stream = await extractVisionOS(id);
        streamUrl = stream.url;
        setCache(id, streamUrl);
      } catch (visionErr) {
        console.warn(`Audio proxy: VisionOS failed for [${id}], trying YTDL:`, visionErr.message);
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const info = await ytdlClient.getInfo(videoUrl);
        const audioFormats = info.formats.filter(
          (f) => f.hasAudio && (!f.hasVideo || f.mimeType?.includes('audio'))
        );
        const m4a = audioFormats.find((f) => f.mimeType?.includes('mp4') && f.url);
        const best =
          m4a ||
          audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0] ||
          info.formats.find((f) => f.url);
        if (best && best.url) {
          streamUrl = best.url;
          setCache(id, streamUrl);
        }
      }
    }

    if (!streamUrl) {
      return res.status(404).send('Audio stream not found');
    }

    // Forward range header from ExoPlayer for smooth seeking and instant playback
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstream = await fetch(streamUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    res.status(upstream.status);

    const copyHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
    ];
    for (const h of copyHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', 'audio/mp4');
    }

    const { Readable } = require('stream');
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error('Audio proxy error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Streaming error: ' + err.message);
    }
  }
});

// GET /api/tracks/:id/stream - Returns direct M4A audio stream URL
router.get('/:id/stream', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Track ID required' });

  const cached = getCached(id);
  if (cached) return res.json({ url: cached, cached: true });

  // Tier 1: Direct VisionOS InnerTube extraction
  try {
    const stream = await extractVisionOS(id);
    setCache(id, stream.url);
    return res.json({
      url: stream.url,
      quality: stream.quality,
      mimeType: stream.mimeType,
    });
  } catch (visionErr) {
    console.warn(`Tier 1 VisionOS failed for [${id}]:`, visionErr.message);
  }

  // Tier 2: @distube/ytdl-core fallback
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    const info = await ytdlClient.getInfo(videoUrl);
    const audioFormats = info.formats.filter(
      (f) => f.hasAudio && (!f.hasVideo || f.mimeType?.includes('audio'))
    );
    const m4a = audioFormats.find((f) => f.mimeType?.includes('mp4') && f.url);
    const best =
      m4a ||
      audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0] ||
      info.formats.find((f) => f.url);

    if (best && best.url) {
      setCache(id, best.url);
      return res.json({
        url: best.url,
        quality: best.audioBitrate ? `${best.audioBitrate}kbps` : 'standard',
        mimeType: best.mimeType || 'audio/mp4',
      });
    }
  } catch (ytdlErr) {
    console.warn(`Tier 2 YTDL failed for [${id}]:`, ytdlErr.message);
  }

  return res.status(500).json({
    error: 'Failed to get stream URL',
    message: `All stream extraction attempts failed for ${id}`,
  });
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
