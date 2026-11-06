# TuneCraft (TuneApp) 🎵⚡

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-blue.svg)](https://expressjs.com/)
[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2058-000000.svg)](https://expo.dev/)
[![Android](https://img.shields.io/badge/Android-14%2B%20ExoPlayer-3DDC84.svg)](https://developer.android.com/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Deployment](https://img.shields.io/badge/Render-Live%20Backend-46E3B7.svg)](https://tuneapp.onrender.com/api/system/health)

> **TuneCraft** is an ad-free, high-fidelity music streaming ecosystem featuring a dark OLED aesthetic, natural typography, instant M4A audio stream extraction, and true background playback that survives aggressive Android battery managers.

---

## 🌟 Key Highlights

- 🎧 **Zero Audio Ads**: Pure, uninterrupted high-quality music streaming.
- 📱 **True Background Audio**: Patched ExoPlayer native foreground service (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`) keeping music alive with the screen off or app minimized.
- 🌙 **Modern OLED Dark Aesthetic**: Matte black (`#08080A`) interface with vibrant Electric Blue (`#2F80ED`) neon accents and floating capsule navigation dock.
- ⚡ **Multi-Tier Audio Extraction**: Direct VisionOS InnerTube + Distube Ytdl engine delivering direct M4A audio streams in under 500ms.
- 🔄 **Quota-Resilient Search**: Official YouTube Data API v3 integration with an automatic fallback to scraper (`yt-search`) whenever Google Cloud's 100 queries/day quota is reached.
- 👥 **Personalized Profile Onboarding**: 2D minimalist lo-fi illustrated avatars (DiceBear CDN) and custom image upload (`expo-image-picker`).
- 🌟 **Dedicated Curation & Artist Hub**: Dedicated views for top international artists (Kendrick Lamar, The Weeknd, Drake, Kanye West, Travis Scott, Billie Eilish) and curated hero playlists (Discover Weekly, Day-Starter Beats, Starboy Radio) with persistent floating mini player controls.
- 📋 **Advanced Queue Management**: Multi-select track selection ("Play Selected", batch remove) and an inline "+ Add Tracks" search modal.

---

## 🏗️ Architecture Overview

TuneCraft is built with a decoupled architecture separating client UI from stream extraction:

```
┌────────────────────────────────────────────────────────┐
│               TuneCraft Mobile Client                   │
│   (React Native, Expo SDK 58, ExoPlayer Audio Engine)   │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       Search & Metadata        Direct M4A Audio Stream
                │                        │
┌───────────────▼────────────────────────▼───────────────┐
│               TuneCraft Backend API                    │
│        (Node.js, Express, VisionOS InnerTube)          │
│            Live on: tuneapp.onrender.com               │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Backend Service (TuneApp)

The backend acts as an ultra-fast audio resolution engine and proxy, avoiding heavy video processing or client-side decryption bottlenecks.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/system/health` | Health check & uptime monitor |
| `GET` | `/api/search?q={query}&type={genre}` | Music search with in-memory caching & scraper fallback |
| `GET` | `/api/tracks/:id/stream` | Resolves direct M4A audio stream URLs via VisionOS client |

#### 1. Search Music
```http
GET /api/search?q=Kendrick%20Lamar
```
**Response:**
```json
{
  "results": [
    {
      "id": "tvTRZJ-4EyI",
      "title": "Kendrick Lamar - Not Like Us",
      "artist": "Kendrick Lamar",
      "thumbnail": "https://i.ytimg.com/vi/tvTRZJ-4EyI/hqdefault.jpg",
      "duration": 274,
      "views": "180,450,210",
      "url": "https://youtube.com/watch?v=tvTRZJ-4EyI"
    }
  ],
  "source": "youtube-api-v3"
}
```

#### 2. Get Audio Stream URL
```http
GET /api/tracks/tvTRZJ-4EyI/stream
```
**Response:**
```json
{
  "url": "https://rr2---sn-4g5edn6r.googlevideo.com/videoplayback?expire=...",
  "quality": "130kbps",
  "mimeType": "audio/mp4"
}
```

---

## 🛠️ Local Backend Setup

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### 1. Clone & Install
```bash
git clone https://github.com/SudhanshuYadav174/TuneApp.git
cd TuneApp
npm install
```

### 2. Environment Variables
Create a `.env` file in the root of `TuneApp`:
```env
PORT=3000
YOUTUBE_API_KEY=your_optional_youtube_api_key
YT_COOKIE=your_optional_cookie_string
NODE_ENV=development
```
*(Note: If `YOUTUBE_API_KEY` is omitted or its daily quota is exhausted, the server automatically routes queries through the built-in scraper fallback without breaking!)*

### 3. Run Locally
```bash
npm run dev
# Server running at http://localhost:3000
```

---

## 📱 Mobile App (TuneCraft)

The mobile client is powered by React Native and Expo SDK 58.

### Tech Stack
- **Framework**: React Native (Expo SDK 58)
- **Audio Engine**: Patched `expo-audio` with native Android ExoPlayer foreground service
- **State Management**: React Context (`PlayerContext`, `PlaylistContext`)
- **Navigation**: React Navigation (Native Stack + Floating Bottom Tabs)
- **Networking**: Axios with automatic fallback from YouTube API to Render Cloud Backend
- **Storage**: AsyncStorage for profiles, playlists, and cached preferences
- **Artwork & Avatars**: Verified Spotify CDN, Deezer CDN, and DiceBear CDN

### Running Mobile App
```bash
cd MobileApp
npm install --legacy-peer-deps
npx expo start
```
- Press `a` for Android Emulator or physical device connected via ADB.
- Press `w` for Expo Web dev preview (`http://localhost:8081`).

### Building Standalone APK
TuneCraft uses Expo Application Services (EAS) to build production Android APKs:
```bash
cd MobileApp
npx eas-cli build --platform android --profile preview --non-interactive
```

---

## 🔋 Android Background Playback Optimization

Some aggressive Android skins (such as Xiaomi **HyperOS / MIUI** and Oppo/Realme **ColorOS**) enforce non-standard process termination when the screen locks.

To guarantee indefinite background playback:
1. Open **Settings** > **Apps** > **Manage Apps** > **TuneCraft**.
2. Select **Battery Saver** and change it from *Recommended* to **No restrictions**.
3. Toggle off **Pause app activity if unused**.
4. In **App permissions** / **Other permissions**, allow **Display pop-up windows while running in the background** and **Show on Lock screen**.

---

## 🛡️ License

This project is licensed under the [MIT License](LICENSE). Built for learning and personal music streaming.
