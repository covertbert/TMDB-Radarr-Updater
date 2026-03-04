# TMDb Digital Releases -> Radarr (TypeScript)

This container polls TMDb for digitally released movies and adds them to Radarr when their TMDb score is above your threshold.

Rules implemented:

- Uses TMDb discover with `with_release_type=4` (digital release).
- Limits discover results to an inclusive digital release window (`with_release_type=4`, `release_date.gte`, `release_date.lte`, default 30 days via `TMDB_RELEASE_WINDOW_DAYS`).
- Excludes movies currently returned by TMDb `now_playing` (proxy for "still in theatres").
- Applies rating threshold (`TMDB_MIN_SCORE`, default `7.5`).
- Requires at least `300` TMDb votes (`TMDB_MIN_VOTE_COUNT`, values lower than `300` are clamped).
- Skips anything already in Radarr by `tmdbId`.

## Required API docs used

- TMDb API (`/3/discover/movie`, `/3/movie/now_playing`, auth): https://developer.themoviedb.org/
- Radarr API (`/api/v3/movie`, `/api/v3/movie/lookup/tmdb`, `/api/v3/qualityprofile`, `/api/v3/rootfolder`): https://github.com/devopsarr/radarr-go

## Quick start

1. Copy `.env.example` to `.env` and set values.
2. Build and run:

```bash
npm install
npm run build
RUN_ONCE=true node dist/index.js
```

3. For Docker:

```bash
docker build -t local/tmdb-radarr-digital:latest .
docker run --rm --env-file .env local/tmdb-radarr-digital:latest
```

## Synology compose integration

Use [docker-compose.snippet.yml](/Users/bertieblackman/Projects/movie-star/docker-compose.snippet.yml) as a base and paste the service into your arr stack compose.

Important: because the service sets its own `environment`, the values from `x-common-config.environment` must be repeated (already done in the snippet).

## Environment variables

Required:

- `TMDB_BEARER_TOKEN` or `TMDB_API_KEY`
- `RADARR_URL`
- `RADARR_API_KEY`
- `RADARR_ROOT_FOLDER_PATH`
- `RADARR_QUALITY_PROFILE_ID` or `RADARR_QUALITY_PROFILE_NAME`

Optional (defaults):

- `TMDB_REGION=GB`
- `TMDB_LANGUAGE=en-US`
- `TMDB_MIN_SCORE=7.5`
- `TMDB_MIN_VOTE_COUNT=300`
- `TMDB_RELEASE_WINDOW_DAYS=30`
- `TMDB_DISCOVER_PAGES=3`
- `TMDB_NOW_PLAYING_PAGES=5`
- `RADARR_SEARCH_ON_ADD=true`
- `RADARR_MONITORED=true`
- `RADARR_MINIMUM_AVAILABILITY=released`
- `DRY_RUN=true` (when `true`, logs what would be added and does not call Radarr add)
- `POLL_INTERVAL_HOURS=24`
- `RUN_ONCE=false`

## Notes

- `RUN_ONCE=false` runs forever and sleeps between syncs.
- Weekly cadence is supported; set `TMDB_RELEASE_WINDOW_DAYS=7` for strict weekly-only matching.
- Set `DRY_RUN=false` when you want real Radarr add calls.
- `RUN_ONCE=true` is useful for testing.
- This project uses TMDb data but is not endorsed or certified by TMDb.
