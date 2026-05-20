import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export interface FixtureResponse {
  status?: number;
  body: unknown;
}

export interface Fixture {
  url: string;
  query?: Record<string, string>;
  method?: string;
  authMode?: 'openapi' | 'web';
  response: FixtureResponse;
}

export interface ScenarioRequest {
  url: string;
  params?: Record<string, string>;
  match?: string;
}

export interface ScenarioResponse {
  status?: number;
  body: unknown;
}

export interface Scenario {
  name: string;
  description?: string;
  authMode?: 'openapi' | 'web';
  sequence: Array<{
    request: ScenarioRequest;
    response: ScenarioResponse;
  }>;
}

let fixtures: Array<Fixture & { index: number }> = [];
let sequence: Array<{ response: FixtureResponse }> = [];
let nextSequenceIndex = 0;
let isMocked = false;
let originalFetch: typeof fetch | null = null;

function spyFetch(): void {
  if (isMocked) return;
  originalFetch = globalThis.fetch;
  isMocked = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (url: URL | Request | string, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.href;
    const method = (options?.method ?? 'GET').toUpperCase();

    // First check sequence (ordered)
    if (nextSequenceIndex < sequence.length) {
      const seq = sequence[nextSequenceIndex];
      nextSequenceIndex++;
      return makeResponse(seq.response.status ?? 200, seq.response.body);
    }

    // Then check registered fixtures (order matters for first-match)
    const matched = fixtures.find(f => {
      if (f.method && f.method.toUpperCase() !== method) return false;
      if (!urlStr.startsWith(f.url)) return false;
      if (f.query) {
        const urlObj = new URL(urlStr);
        for (const [k, v] of Object.entries(f.query)) {
          if (urlObj.searchParams.get(k) !== v) return false;
        }
      }
      return true;
    });

    if (matched) {
      return makeResponse(matched.response.status ?? 200, matched.response.body);
    }

    throw new Error(`[fixture loader] No fixture matched: ${method} ${urlStr}`);
  };
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

export function registerFixture(fixture: Fixture): void {
  if (!isMocked) spyFetch();
  fixtures.push({ ...fixture, index: fixtures.length });
}

export function resetFixtures(): void {
  fixtures = [];
  sequence = [];
  nextSequenceIndex = 0;
  if (isMocked && originalFetch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
    originalFetch = null;
    isMocked = false;
  }
}

export function loadScenario(name: string): void {
  const baseDir = dirname(__filename);
  const scenarioPath = join(baseDir, '..', '..', 'fixtures', 'scenarios', `${name}.json`);

  if (!existsSync(scenarioPath)) {
    throw new Error(`[fixture loader] Scenario file not found: ${scenarioPath}`);
  }

  const content = readFileSync(scenarioPath, 'utf-8');
  const scenario: Scenario = JSON.parse(content);

  if (!scenario || !scenario.sequence) {
    throw new Error(`[fixture loader] Invalid scenario: ${name}`);
  }

  if (!isMocked) spyFetch();
  sequence = scenario.sequence.map(seq => ({ response: seq.response }));
  nextSequenceIndex = 0;

  // Also register fixtures for non-sequence based lookups
  for (const seq of scenario.sequence) {
    registerFixture({
      url: seq.request.url,
      method: 'GET',
      response: seq.response,
    });
  }
}