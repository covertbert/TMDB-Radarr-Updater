import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type MovieStatusType = "announced" | "inCinemas" | "released" | "preDB";

interface Config {
  tmdbBearerToken?: string;
  tmdbApiKey?: string;
  tmdbLanguage: string;
  tmdbMinScore: number;
  tmdbMinVoteCount: number;
  tmdbReleaseWindowDays: number;
  radarrUrl: string;
  radarrApiKey: string;
  radarrRootFolderPath: string;
  radarrQualityProfileId?: number;
  radarrQualityProfileName?: string;
  radarrSearchOnAdd: boolean;
  radarrMonitored: boolean;
  radarrMinimumAvailability: MovieStatusType;
  dryRun: boolean;
}

interface TmdbMovie {
  id: number;
  title: string;
  vote_average: number;
  vote_count: number;
  release_date: string;
}

interface TmdbPagedResponse<T> {
  page: number;
  total_pages: number;
  results: T[];
}

interface RadarrMovie {
  id: number;
  title: string;
  tmdbId?: number;
}

interface RadarrQualityProfile {
  id: number;
  name: string;
}

interface RadarrRootFolder {
  id: number;
  path: string;
}

type JsonObject = Record<string, unknown>;

class HttpError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function loadDotEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  console.log(`${new Date().toISOString()} [${level}] ${message}`);
}

function requiredString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ?? undefined;
}

function parseNumber(value: string, envName: string, min?: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new TypeError(`Invalid numeric value in ${envName}: ${value}`);
  }

  if (min !== undefined && parsed < min) {
    throw new Error(`${envName} must be >= ${min}`);
  }

  return parsed;
}

function parseBoolean(value: string, envName: string): boolean {
  const lowered = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(lowered)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(lowered)) {
    return false;
  }

  throw new Error(`Invalid boolean value in ${envName}: ${value}`);
}

function normalizeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}

function normalizeMinimumAvailability(value: string): MovieStatusType {
  const raw = value.trim();
  const lowered = raw.toLowerCase();
  if (lowered === "announced") {
    return "announced";
  }

  if (lowered === "incinemas" || lowered === "in_cinemas" || lowered === "in-cinemas") {
    return "inCinemas";
  }

  if (lowered === "released") {
    return "released";
  }

  if (lowered === "predb" || lowered === "pre_db" || lowered === "pre-db") {
    return "preDB";
  }

  throw new Error(
    `Invalid RADARR_MINIMUM_AVAILABILITY value: ${raw}. Use announced, inCinemas, released, or preDB.`
  );
}

function readConfig(): Config {
  const tmdbBearerToken = optionalString("TMDB_BEARER_TOKEN");
  const tmdbApiKey = optionalString("TMDB_API_KEY");

  if (!tmdbBearerToken && !tmdbApiKey) {
    throw new Error("Set TMDB_BEARER_TOKEN or TMDB_API_KEY");
  }

  const radarrQualityProfileIdRaw = optionalString("RADARR_QUALITY_PROFILE_ID");
  const radarrQualityProfileName = optionalString("RADARR_QUALITY_PROFILE_NAME");
  const tmdbMinVoteCountConfigured = parseNumber(
    requiredString("TMDB_MIN_VOTE_COUNT"),
    "TMDB_MIN_VOTE_COUNT",
    0
  );
  const tmdbReleaseWindowDaysConfigured = parseNumber(
    requiredString("TMDB_RELEASE_WINDOW_DAYS"),
    "TMDB_RELEASE_WINDOW_DAYS",
    1
  );
  if (!radarrQualityProfileIdRaw && !radarrQualityProfileName) {
    throw new Error("Set RADARR_QUALITY_PROFILE_ID or RADARR_QUALITY_PROFILE_NAME");
  }

  return {
    tmdbBearerToken,
    tmdbApiKey,
    tmdbLanguage: requiredString("TMDB_LANGUAGE"),
    tmdbMinScore: parseNumber(requiredString("TMDB_MIN_SCORE"), "TMDB_MIN_SCORE", 0),
    tmdbMinVoteCount: Math.max(tmdbMinVoteCountConfigured, 500),
    tmdbReleaseWindowDays: Math.max(1, Math.floor(tmdbReleaseWindowDaysConfigured)),
    radarrUrl: normalizeUrl(requiredString("RADARR_URL")),
    radarrApiKey: requiredString("RADARR_API_KEY"),
    radarrRootFolderPath: requiredString("RADARR_ROOT_FOLDER_PATH"),
    radarrQualityProfileId: radarrQualityProfileIdRaw
      ? parseNumber(radarrQualityProfileIdRaw, "RADARR_QUALITY_PROFILE_ID", 1)
      : undefined,
    radarrQualityProfileName,
    radarrSearchOnAdd: parseBoolean(requiredString("RADARR_SEARCH_ON_ADD"), "RADARR_SEARCH_ON_ADD"),
    radarrMonitored: parseBoolean(requiredString("RADARR_MONITORED"), "RADARR_MONITORED"),
    radarrMinimumAvailability: normalizeMinimumAvailability(
      requiredString("RADARR_MINIMUM_AVAILABILITY")
    ),
    dryRun: parseBoolean(requiredString("DRY_RUN"), "DRY_RUN")
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const cause =
      error instanceof Error ? String((error as Error & { cause?: unknown }).cause) : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network error while requesting ${url}: ${message}${cause ? ` | cause: ${cause}` : ""}`
    );
  }

  const bodyText = await response.text();

  if (!response.ok) {
    throw new HttpError(
      response.status,
      bodyText,
      `Request failed ${response.status} ${response.statusText}: ${url}`
    );
  }

  if (!bodyText.trim()) {
    return {} as T;
  }

  return JSON.parse(bodyText) as T;
}

class TmdbClient {
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly authHeaders: HeadersInit;

  constructor(private readonly config: Config) {
    this.authHeaders = this.config.tmdbBearerToken
      ? { Authorization: `Bearer ${this.config.tmdbBearerToken}` }
      : {};
  }

  private buildUrl(path: string, params: Record<string, string | number | boolean>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }

    if (!this.config.tmdbBearerToken && this.config.tmdbApiKey) {
      searchParams.set("api_key", this.config.tmdbApiKey);
    }

    return `${this.baseUrl}${path}?${searchParams.toString()}`;
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    return fetchJson<T>(url, {
      method: "GET",
      headers: this.authHeaders
    });
  }

  public async fetchDigitalReleases(): Promise<TmdbMovie[]> {
    const windowEndDate = new Date();
    const windowStartDate = new Date(windowEndDate);
    windowStartDate.setUTCDate(
      windowStartDate.getUTCDate() - (this.config.tmdbReleaseWindowDays - 1)
    );
    const primaryReleaseDateFloor = new Date(windowEndDate);
    primaryReleaseDateFloor.setUTCFullYear(primaryReleaseDateFloor.getUTCFullYear() - 1);
    const digitalReleaseDateEnd = windowEndDate.toISOString().slice(0, 10);
    const digitalReleaseDateStart = windowStartDate.toISOString().slice(0, 10);
    const primaryReleaseDateGte = primaryReleaseDateFloor.toISOString().slice(0, 10);
    const movies = new Map<number, TmdbMovie>();

    for (let page = 1; ; page += 1) {
      const response = await this.get<TmdbPagedResponse<TmdbMovie>>("/discover/movie", {
        include_adult: false,
        include_video: false,
        language: this.config.tmdbLanguage,
        page,
        sort_by: "release_date.desc",
        with_release_type: 4,
        "release_date.gte": digitalReleaseDateStart,
        "release_date.lte": digitalReleaseDateEnd,
        "primary_release_date.gte": primaryReleaseDateGte,
        "vote_average.gte": this.config.tmdbMinScore,
        "vote_count.gte": this.config.tmdbMinVoteCount
      });

      for (const movie of response.results) {
        movies.set(movie.id, movie);
      }

      if (page >= response.total_pages) {
        break;
      }
    }

    return [...movies.values()];
  }
}

class RadarrClient {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;

  constructor(private readonly config: Config) {
    this.baseUrl = `${this.config.radarrUrl}/api/v3`;
    this.headers = {
      "X-Api-Key": this.config.radarrApiKey,
      "Content-Type": "application/json"
    };
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return fetchJson<T>(this.buildUrl(path, params), {
      method: "GET",
      headers: this.headers
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(this.buildUrl(path), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body)
    });
  }

  public async resolveQualityProfileId(): Promise<number> {
    if (this.config.radarrQualityProfileId) {
      return this.config.radarrQualityProfileId;
    }

    const profiles = await this.get<RadarrQualityProfile[]>("/qualityprofile");
    const wantedName = this.config.radarrQualityProfileName;
    if (!wantedName) {
      throw new Error("Quality profile name missing");
    }

    const matched =
      profiles.find((profile) => profile.name === wantedName) ??
      profiles.find((profile) => profile.name.toLowerCase() === wantedName.toLowerCase());

    if (!matched) {
      const available = profiles.map((profile) => profile.name).join(", ");
      throw new Error(
        `RADARR_QUALITY_PROFILE_NAME '${wantedName}' not found. Available profiles: ${available}`
      );
    }

    return matched.id;
  }

  public async verifyRootFolderPath(): Promise<void> {
    const configured = normalizePath(this.config.radarrRootFolderPath);
    const folders = await this.get<RadarrRootFolder[]>("/rootfolder");
    const exists = folders.some((folder) => normalizePath(folder.path) === configured);

    if (!exists) {
      const available = folders.map((folder) => folder.path).join(", ");
      throw new Error(
        `RADARR_ROOT_FOLDER_PATH '${this.config.radarrRootFolderPath}' not found. Available root folders: ${available}`
      );
    }
  }

  public async fetchExistingTmdbIds(): Promise<Set<number>> {
    const movies = await this.get<RadarrMovie[]>("/movie");
    const ids = new Set<number>();

    for (const movie of movies) {
      if (typeof movie.tmdbId === "number") {
        ids.add(movie.tmdbId);
      }
    }

    return ids;
  }

  public async lookupMovieByTmdbId(tmdbId: number): Promise<JsonObject | null> {
    try {
      const directLookup = await this.get<JsonObject | JsonObject[]>("/movie/lookup/tmdb", {
        tmdbId
      });
      if (Array.isArray(directLookup)) {
        return directLookup[0] ?? null;
      }

      if (Object.keys(directLookup).length > 0) {
        return directLookup;
      }
    } catch (error) {
      if (!(error instanceof HttpError) || ![400, 404].includes(error.status)) {
        throw error;
      }
    }

    const termLookup = await this.get<JsonObject[]>("/movie/lookup", { term: `tmdb:${tmdbId}` });
    return termLookup[0] ?? null;
  }

  public async addMovie(moviePayload: JsonObject): Promise<void> {
    await this.post<JsonObject>("/movie", moviePayload);
  }
}

function buildAddPayload(
  lookupMovie: JsonObject,
  config: Config,
  qualityProfileId: number
): JsonObject {
  const payload: JsonObject = {
    ...lookupMovie,
    qualityProfileId,
    rootFolderPath: config.radarrRootFolderPath,
    monitored: config.radarrMonitored,
    minimumAvailability: config.radarrMinimumAvailability,
    addOptions: {
      searchForMovie: config.radarrSearchOnAdd
    }
  };

  delete payload.id;

  return payload;
}

function safeMovieLabel(movie: TmdbMovie): string {
  return `${movie.title} (tmdb:${movie.id}, score:${movie.vote_average}, release:${movie.release_date})`;
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof HttpError)) {
    return false;
  }

  if (![400, 409].includes(error.status)) {
    return false;
  }

  const bodyLower = error.body.toLowerCase();
  return bodyLower.includes("already") && bodyLower.includes("movie");
}

async function runSync(
  config: Config,
  tmdbClient: TmdbClient,
  radarrClient: RadarrClient,
  qualityProfileId: number
): Promise<void> {
  log("INFO", "Starting sync run");
  if (config.dryRun) {
    log("INFO", "DRY_RUN is enabled; Radarr add requests will be logged only.");
  }

  const [existingTmdbIds, digitalCandidates] = await Promise.all([
    radarrClient.fetchExistingTmdbIds(),
    tmdbClient.fetchDigitalReleases()
  ]);

  const candidates = digitalCandidates
    .filter((movie) => !existingTmdbIds.has(movie.id))
    .sort((a, b) => b.release_date.localeCompare(a.release_date));

  log(
    "INFO",
    `Fetched ${digitalCandidates.length} digital candidates; ${candidates.length} remain after filtering`
  );

  let addedCount = 0;
  let dryRunCount = 0;
  let skippedCount = 0;

  for (const movie of candidates) {
    try {
      const lookup = await radarrClient.lookupMovieByTmdbId(movie.id);
      if (!lookup) {
        skippedCount += 1;
        log("WARN", `Radarr lookup returned no result for ${safeMovieLabel(movie)}; skipping`);
        continue;
      }

      const payload = buildAddPayload(lookup, config, qualityProfileId);
      if (config.dryRun) {
        dryRunCount += 1;
        log(
          "INFO",
          `DRY_RUN would add: ${safeMovieLabel(movie)} | qualityProfileId=${qualityProfileId} | rootFolderPath=${config.radarrRootFolderPath} | monitored=${config.radarrMonitored ? "true" : "false"} | minimumAvailability=${config.radarrMinimumAvailability} | searchForMovie=${config.radarrSearchOnAdd ? "true" : "false"}`
        );
        continue;
      }

      await radarrClient.addMovie(payload);
      existingTmdbIds.add(movie.id);
      addedCount += 1;
      log("INFO", `Added to Radarr: ${safeMovieLabel(movie)}`);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        existingTmdbIds.add(movie.id);
        skippedCount += 1;
        log("INFO", `Already exists in Radarr: ${safeMovieLabel(movie)}`);
        continue;
      }

      if (error instanceof HttpError) {
        skippedCount += 1;
        log(
          "ERROR",
          `Failed adding ${safeMovieLabel(movie)} (HTTP ${error.status}): ${error.body.slice(0, 300)}`
        );
        continue;
      }

      skippedCount += 1;
      log("ERROR", `Failed adding ${safeMovieLabel(movie)}: ${String(error)}`);
    }
  }

  log(
    "INFO",
    `Sync run complete: added=${addedCount}, dryRun=${dryRunCount}, skipped=${skippedCount}`
  );
}

async function main(): Promise<void> {
  loadDotEnvFile();
  const config = readConfig();
  log("INFO", `Configured Radarr URL: ${config.radarrUrl}`);
  log("INFO", `DRY_RUN mode: ${config.dryRun ? "enabled" : "disabled"}`);
  const tmdbClient = new TmdbClient(config);
  const radarrClient = new RadarrClient(config);

  await radarrClient.verifyRootFolderPath();
  const qualityProfileId = await radarrClient.resolveQualityProfileId();
  log("INFO", `Using Radarr quality profile id ${qualityProfileId}`);
  await runSync(config, tmdbClient, radarrClient, qualityProfileId);
  log("INFO", "Single run complete");
}

main().catch((error: unknown) => {
  log("ERROR", `Fatal error: ${String(error)}`);
  process.exit(1);
});
