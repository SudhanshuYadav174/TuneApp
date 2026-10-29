/**
 * routes/search.js
 * Dual mode search:
 * 1. Uses Official YouTube Data API v3 if YOUTUBE_API_KEY is provided
 * 2. Seamlessly falls back to yt-search if no API key is set
 */
const express = require('express');
const axios = require('axios');
const yts = require('yt-search');
const router = express.Router();

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 mins

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

// Convert ISO 8601 duration (PT3M25S) to seconds
function parseIsoDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Official YouTube Data API v3 Search
async function searchWithYouTubeApi(query, apiKey) {
  const searchUrl = 'https://www.googleapis.com/youtube/v3/search';
  const searchRes = await axios.get(searchUrl, {
    params: {
      part: 'snippet',
      q: query,
      type: 'video',
      videoCategoryId: '10', // Music category
      maxResults: 20,
      key: apiKey,
    },
  });

  const videoIds = searchRes.data.items
    .map((item) => item.id?.videoId)
    .filter(Boolean)
    .join(',');

  if (!videoIds) return [];

  // Fetch details (duration, statistics)
  const detailsUrl = 'https://www.googleapis.com/youtube/v3/videos';
  const detailsRes = await axios.get(detailsUrl, {
    params: {
      part: 'contentDetails,statistics,snippet',
      id: videoIds,
      key: apiKey,
    },
  });

  return detailsRes.data.items.map((v) => ({
    id: v.id,
    title: v.snippet.title,
    artist: v.snippet.channelTitle,
    thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url,
    duration: parseIsoDuration(v.contentDetails?.duration),
    views: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10).toLocaleString() : undefined,
    url: `https://youtube.com/watch?v=${v.id}`,
  }));
}

// GET /api/search?q=query&type=genre|album
router.get('/', async (req, res) => {
  try {
    const { q, type } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const searchQuery = type === 'genre' ? `${q} music playlist` : q;
    const cacheKey = `search:${searchQuery}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ results: cached, fromCache: true });

    const apiKey = process.env.YOUTUBE_API_KEY;
    const hasValidKey = apiKey && apiKey !== 'your_youtube_api_key_here';

    let songs = [];

    if (hasValidKey) {
      try {
        songs = await searchWithYouTubeApi(searchQuery, apiKey);
      } catch (apiErr) {
        console.warn('YouTube API error, falling back to yt-search:', apiErr.response?.data?.error?.message || apiErr.message);
        // Fallback
        const result = await yts(searchQuery);
        songs = result.videos.slice(0, 20).map((v) => ({
          id: v.videoId,
          title: v.title,
          artist: v.author?.name || 'Unknown Artist',
          thumbnail: v.thumbnail,
          duration: v.seconds,
          views: v.views?.toLocaleString(),
          url: v.url,
        }));
      }
    } else {
      const result = await yts(searchQuery);
      songs = result.videos.slice(0, 20).map((v) => ({
        id: v.videoId,
        title: v.title,
        artist: v.author?.name || 'Unknown Artist',
        thumbnail: v.thumbnail,
        duration: v.seconds,
        views: v.views?.toLocaleString(),
        url: v.url,
      }));
    }

    setCache(cacheKey, songs);
    res.json({ results: songs, source: hasValidKey ? 'youtube-api-v3' : 'scraper-fallback' });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

module.exports = router;
