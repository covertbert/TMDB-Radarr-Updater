# TMDb Digital Releases -> Radarr (TypeScript)

This container polls TMDb for digitally released movies and adds them to Radarr when their TMDb score is above your threshold.

Rules implemented:

- Uses TMDb discover with `with_release_type=4` (digital release).
- Limits discover results to an inclusive digital release window (`with_release_type=4`, `release_date.gte`, `release_date.lte`, controlled by `TMDB_RELEASE_WINDOW_DAYS`).
- Fetches all available TMDb pages for discover results.
- Uses global TMDb release data (not region-restricted) so any valid digital release can qualify.
- Applies rating threshold (`TMDB_MIN_SCORE`).
- Requires at least `500` TMDb votes (`TMDB_MIN_VOTE_COUNT`, values lower than `500` are clamped).
- Excludes titles with original release dates older than a rolling 1-year window.
- Skips anything already in Radarr by `tmdbId`.

## Required API docs used

- TMDb API (`/3/discover/movie`, auth): https://developer.themoviedb.org/
- Radarr API (`/api/v3/movie`, `/api/v3/movie/lookup/tmdb`, `/api/v3/qualityprofile`, `/api/v3/rootfolder`): https://github.com/devopsarr/radarr-go

## Quick start

1. Copy `.env.example` to `.env` and set values.
2. Build and run:

```bash
npm install
npm run build
node dist/index.js
```

3. For Docker:

```bash
docker build -t local/tmdb-radarr-digital:latest .
docker run --rm --env-file .env local/tmdb-radarr-digital:latest
```

## Docker Hub publish (GitHub Actions)

This repo includes [docker-publish.yml](/Users/bertieblackman/Projects/movie-star/.github/workflows/docker-publish.yml), which builds and pushes a multi-arch image (`linux/amd64`, `linux/arm64`) to Docker Hub.

Setup once in GitHub repository settings:

1. Create a Docker Hub Access Token.
2. Add GitHub Actions secrets:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
3. Ensure your Docker Hub repo name matches your GitHub repo name (currently `movie-star`) under that username.

Publish triggers:

- Push to `main`
- Push a tag like `v1.0.0`
- Manual run via `workflow_dispatch`

Image naming and tags:

- Image: `docker.io/<DOCKERHUB_USERNAME>/movie-star`
- Tags:
  - `latest` on default branch
  - Git tag names (for example `v1.0.0`)
  - commit SHA tags

## Synology compose integration

Use this standalone compose (no shared anchors):

```yaml
services:
  tmdb-radarr-digital:
    image: docker.io/covertbert/tmdb-radarr-updater:latest
    container_name: tmdb-radarr-digital
    restart: unless-stopped
    environment:
      # Set one of TMDB_BEARER_TOKEN or TMDB_API_KEY.
      TMDB_BEARER_TOKEN: ""
      TMDB_API_KEY: "your_tmdb_api_key"
      TMDB_LANGUAGE: "en-US"
      TMDB_MIN_SCORE: "7"
      TMDB_MIN_VOTE_COUNT: "500"
      TMDB_RELEASE_WINDOW_DAYS: "14"
      RADARR_URL: "http://radarr:7878"
      RADARR_API_KEY: "your_radarr_api_key"
      RADARR_ROOT_FOLDER_PATH: "/data/media/movies"
      # Set one of RADARR_QUALITY_PROFILE_ID or RADARR_QUALITY_PROFILE_NAME.
      RADARR_QUALITY_PROFILE_ID: ""
      RADARR_QUALITY_PROFILE_NAME: "HD-1080p"
      RADARR_SEARCH_ON_ADD: "true"
      RADARR_MONITORED: "true"
      RADARR_MINIMUM_AVAILABILITY: "released"
```

You can also use [docker-compose.yml](/Users/bertieblackman/Projects/movie-star/docker-compose.yml) directly.

For local development, the app still loads `.env` automatically at runtime.

## Environment variables

- Single source of truth: `.env.example`.
- Copy it to `.env` and set values there.
- The app has no fallback defaults in code; all variables must be set in `.env` (or injected environment).
- Pair requirements:
- Set one of `TMDB_BEARER_TOKEN` or `TMDB_API_KEY`.
- Set one of `RADARR_QUALITY_PROFILE_ID` or `RADARR_QUALITY_PROFILE_NAME`.

## Notes

- The app always performs a single sync run, then exits.
- Schedule recurrence in your container manager (for example a weekly scheduled task).
- Recommended for new, high-signal releases: `TMDB_RELEASE_WINDOW_DAYS=14`.
- Set `DRY_RUN=true` when you want a dry run.
- This project uses TMDb data but is not endorsed or certified by TMDb.
