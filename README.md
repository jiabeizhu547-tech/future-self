# future-self

A WeChat Mini Program for private journaling and AI-powered life trajectory projection. Think of it as a "CT scan for life": log scattered thoughts daily, let AI surface emotional patterns, project possible futures, and calibrate present actions toward the future you want.

## How It Works

1. **Log** -- Write down anything on your mind each day. Mood and anxiety sliders are optional, making friction as low as possible.
2. **Enrich** -- DeepSeek AI reads each entry and extracts structured signals: emotional valence, anxiety level, energy, topics, people mentioned, and directional signals (toward what you want / toward what you don't want).
3. **Trend** -- See how your anxiety and mood evolve over weeks and months. Pick two time windows and let AI compare what changed and why.
4. **Project** -- AI extrapolates 3 possible futures (5 or 10 years out) based on your recent entries: a likely path, an optimistic path, and a cautionary path. Each path links back to specific entries, so you can trace how today's patterns shape tomorrow.
5. **Calibrate** -- Tag each projected path as "want" or "don't want." For paths you want, AI suggests small daily adjustments to increase their probability. For paths you don't want, AI defines early warning signals and scans your history to count how many times they've already appeared.

## Architecture

```
WeChat Mini Program (Taro 4.2 + React 18 + TypeScript)
     |
     |  Taro.cloud.callFunction('deepseek')   (preferred)
     |  or Taro.request (direct API)          (fallback)
     v
DeepSeek API (deepseek-chat)
```

- **Framework**: Taro 4.2 + React 18 + TypeScript + Sass + Webpack 5
- **Storage**: `Taro.getStorageSync` / `Taro.setStorageSync` -- all data stays on device
- **AI**: DeepSeek API, proxied through a WeChat cloud function so the API key never reaches the client
- **Cloud function**: Node.js built-in `https` module, no extra dependencies beyond `wx-server-sdk`

## Project Structure

```
future-self-mp/
├── src/
│   ├── ai/                  # AI transport layer and high-level callers
│   │   ├── client.ts        # Unified callDeepSeek(): cloud function first, direct API fallback
│   │   ├── enrich.ts        # Entry enrichment (signals, sentiment, topics)
│   │   ├── project.ts       # Life trajectory projection (5/10 year paths)
│   │   └── calibrate.ts     # Path calibration (adjustments + early warning signals)
│   ├── services/
│   │   └── storage.ts       # All local storage read/write (entries, enrichments, projections, calibrations)
│   ├── types/
│   │   └── models.ts        # TypeScript interfaces for all data models
│   ├── utils/
│   │   ├── aggregate.ts     # Time-series aggregation for trend charts
│   │   ├── date.ts          # Date formatting and helpers
│   │   └── id.ts            # ID generation
│   ├── pages/
│   │   ├── index/           # Today: quick entry composer
│   │   ├── detail/          # Entry detail and edit
│   │   ├── trends/          # Emotion and anxiety trends, stage comparison
│   │   ├── future/          # Projection list + trigger new projection
│   │   ├── projection/      # Projection detail: path cards + calibration
│   │   └── me/              # Settings: API key, export/import, stats
│   ├── app.ts               # App entry, cloud initialization
│   ├── app.scss             # Global styles
│   └── app.config.ts        # Page routing and tab bar config
├── cloud/functions/
│   ├── deepseek/            # Cloud function: DeepSeek API proxy
│   └── enrich/              # Cloud function: entry enrichment (batch)
├── config/                  # Taro build config (dev/prod)
├── types/                   # Global type declarations
├── cloud/functions/deepseek/config.example.json  # Template for API key config
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- WeChat Developer Tools (for Mini Program preview and cloud function deployment)
- A DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))

### Install

```bash
git clone https://github.com/jiabeizhu547-tech/future-self.git
cd future-self
npm install
```

### Run Locally

```bash
npm run dev:weapp
```

Then open WeChat Developer Tools, import the `dist/` directory as a Mini Program project.

### Without Cloud Functions (Direct API)

1. Open the Mini Program in WeChat Developer Tools
2. Go to the "Me" tab
3. Enter your DeepSeek API Key
4. Start logging -- AI enrichment runs directly against the DeepSeek API

### With Cloud Functions (Recommended)

1. In WeChat Developer Tools, enable Cloud Development and create an environment
2. Copy the environment ID into `src/app.ts` (`CLOUD_ENV` constant)
3. Copy `cloud/functions/deepseek/config.example.json` to `cloud/functions/deepseek/config.json` and fill in your API key
4. Right-click `cloud/functions/deepseek` and select "Upload and Deploy"
5. The app now routes AI calls through the cloud function -- your API key is never sent to the client

## Data Privacy

All journal entries and AI results are stored **only on your device** via WeChat's local storage API. The only data sent to external servers is:

- Journal content (sent to DeepSeek API for enrichment and projection -- either directly or through the cloud function)
- No account registration, no server-side database, no analytics

Use the "Export" button in the Me tab to back up all your data as a JSON file. The export includes entries, enrichments, projections, and calibrations. You can re-import this file to restore your data.

## License

MIT
