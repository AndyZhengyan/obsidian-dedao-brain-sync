// No import needed - using native fetch
import type { ListResponse, GetNoteNote, Attachment } from './types';
import { t } from './i18n';

const OPENAPI_BASE = 'https://openapi.biji.com/open/api/v1';
const WEBAPI_BASE = 'https://get-notes.luojilab.com/voicenotes/web';
export const GETNOTE_LIST_LIMIT = 20;

function safeJsonParse(text: string): unknown {
  const safe = text.replace(
    /"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g,
    '"$1":"$2"'
  );
  return JSON.parse(safe);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAudio(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;

  const original = value.original;
  if (typeof original === 'string') return original;

  const firstTextValue = Object.values(value).find((item): item is string => typeof item === 'string');
  return firstTextValue;
}

function normalizeNoteDetailData(value: unknown): Partial<GetNoteNote> | null {
  if (!isRecord(value)) return null;

  const nestedNote = isRecord(value.note) ? value.note : null;
  const source = nestedNote ?? value;
  const detail = { ...source } as Partial<GetNoteNote>;

  const attachments = (value.attachments ?? source.attachments) as Attachment[] | undefined;
  const audio = normalizeAudio(value.audio ?? source.audio);

  return {
    ...detail,
    attachments,
    audio,
  };
}

async function apiRequest<T>(
  url: string,
  options: RequestInit,
  retries = 1,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const res = await fetch(url, {
    ...options,
    signal,
  });

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (res.status === 401) {
    throw new Error(t('error.invalidCredentials'));
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const limitRemaining = res.headers.get('X-RateLimit-Remaining');

    if ((limitRemaining === '0' || !retryAfter) && retries > 0) {
      throw new Error(t('error.quotaExceeded'));
    }

    if (retryAfter) {
      const baseDelay = parseInt(retryAfter, 10);
      const delay = Math.min(baseDelay, 60) * 1000;
      await new Promise((r, reject) => {
        const timer = window.setTimeout(() => r(undefined), delay);
        signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return apiRequest(url, options, retries - 1, signal);
    }

    throw new Error(t('error.apiFailed', { status: 429, msg: 'Rate limit exceeded' }));
  }

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const data = safeJsonParse(text) as Record<string, unknown>;

  // Handle OpenAPI paid-only error code 10201 — signals Web API fallback needed
  if (data.success === false) {
    const error = data.error as Record<string, unknown> | undefined;
    if (error?.code === 10201) {
      throw new Error('OpenAPI_ONLY_MEMBER');
    }
  }

  // Handle rate limit error code 10202 (qps_bucket_exceeded)
  if (data.success === false) {
    const error = data.error as Record<string, unknown> | undefined;
    if (error?.code === 10202) {
      if (retries > 0) {
        await new Promise((r, reject) => {
          const timer = window.setTimeout(() => r(undefined), 3000);
          signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
        });
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return apiRequest(url, options, retries - 1, signal);
      }
      throw new Error(t('error.apiFailed', { status: 429, msg: '请求频率超限' }));
    }
  }

  return data as T;
}

export interface FetchNotesOptions {
  token: string;
  clientId: string;
  sinceId?: string;
  limit?: number;
  signal?: AbortSignal;
}

// Web API response types
interface WebApiNoteListResponse {
  h: { c: number; e: string; s: number; t: number; apm: string };
  c: {
    total_items: number;
    list: WebApiNote[];
    has_more: boolean;
    next_cursor: string;
  };
}

export interface WebApiNote {
  id: string;
  note_id: string;
  source: string;
  entry_type: string;
  note_type: string;
  title: string;
  json_content: string;
  content: string;
  body_text: string;
  ref_content: string;
  topics: unknown[];
  book_topics: unknown[];
  tags: { id: string; name: string; type: string; visible: boolean; is_deleted: number; create_time: number; update_time: number; tag_type: string }[];
  is_ai_generated: boolean;
  attachments: { type: string; url: string; size: number; title: string; sub_title: string; duration: number; favicon: string }[];
  edit_time: string;
  created_at: string;
  updated_at: string;
  version: number;
  status: number;
  display_status: number;
  share_scope: number;
  is_author: boolean;
}

function webApiNoteToNote(webNote: WebApiNote): GetNoteNote {
  return {
    id: parseInt(webNote.note_id, 10),
    note_id: webNote.note_id,
    title: webNote.title,
    content: webNote.content,
    note_type: webNote.note_type as import('./types').NoteType,
    source: webNote.source,
    tags: webNote.tags.map(tag => ({ name: tag.name })),
    created_at: webNote.created_at,
    updated_at: webNote.updated_at,
    attachments: webNote.attachments.map(att => ({
      type: att.type as 'audio',
      url: att.url,
      title: att.title,
      duration: att.duration,
    })),
  };
}

export async function fetchNotes(options: FetchNotesOptions): Promise<{
  notes: GetNoteNote[];
  hasMore: boolean;
}> {
  const { token, clientId, sinceId = '0', signal } = options;
  const url = `${OPENAPI_BASE}/resource/note/list?since_id=${sinceId}`;

  const data = await apiRequest<ListResponse>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-ID': clientId,
    },
  }, 3, signal);

  return {
    notes: data.data.notes,
    hasMore: data.data.has_more,
  };
}

// Web API fetch functions (bypass OpenAPI paid requirement)
export async function fetchNotesWebApi(
  webToken: string,
  csrfToken: string,
  sinceId: string = '',
  limit: number = 20,
  signal?: AbortSignal
): Promise<{ notes: GetNoteNote[]; hasMore: boolean }> {
  const url = `${WEBAPI_BASE}/notes?limit=${limit}&since_id=${sinceId}&sort=create_desc`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${webToken}`,
      'xi-csrf-token': csrfToken,
      'x-request-id': String(Date.now()),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal,
  });

  if (res.status === 401) {
    throw new Error(t('error.invalidCredentials'));
  }

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const json = safeJsonParse(text) as WebApiNoteListResponse;

  return {
    notes: json.c.list.map(webApiNoteToNote),
    hasMore: json.c.has_more,
  };
}

export async function fetchNoteDetailWebApi(
  noteId: string,
  webToken: string,
  csrfToken: string,
  signal?: AbortSignal
): Promise<Partial<GetNoteNote>> {
  const url = `${WEBAPI_BASE}/notes/${noteId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${webToken}`,
      'xi-csrf-token': csrfToken,
      'x-request-id': String(Date.now()),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal,
  });

  if (res.status === 401) {
    throw new Error(t('error.invalidCredentials'));
  }

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const json = safeJsonParse(text) as WebApiNoteListResponse;
  const note = json.c.list[0];
  if (!note) throw new Error('Note not found');

  return webApiNoteToNote(note);
}

export async function fetchNoteDetail(
  id: string,
  token: string,
  clientId: string,
  signal?: AbortSignal
): Promise<Partial<GetNoteNote>> {
  const url = `${OPENAPI_BASE}/resource/note/detail?id=${id}`;
  const data = await apiRequest<{
    success: boolean;
    data?: unknown;
    error?: { message: string };
  }>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-ID': clientId,
    },
  }, 2, signal);

  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to fetch note detail');
  }

  const noteDetail = normalizeNoteDetailData(data.data);
  if (!noteDetail) {
    throw new Error('Failed to parse note detail');
  }

  return noteDetail;
}

export interface OAuthDeviceCodeResponse {
  verification_uri: string;
  user_code: string;
  code: string;
  interval: number;
}

export interface OAuthTokenResponse {
  api_key: string;
  client_id: string;
}

export async function fetchOAuthDeviceCode(
  signal?: AbortSignal
): Promise<OAuthDeviceCodeResponse> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const res = await fetch(`${OPENAPI_BASE}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'cli_a1b2c3d4e5f6789012345678abcdef90' }),
    signal,
  });

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.oauthDeviceCodeFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const json = safeJsonParse(text) as Record<string, unknown>;

  // Support both { success, data } wrapper and flat response
  const source = (json.data ?? json) as Record<string, unknown>;

  if (json.success === false) {
    throw new Error(t('error.oauthDeviceCodeFailed', { status: res.status, msg: (json.message as string) ?? 'unknown' }));
  }

  if (!source.code && !source.verification_uri) {
    throw new Error(t('error.oauthDeviceCodeFailed', { status: res.status, msg: (json.message as string) ?? 'unknown' }));
  }

  return {
    verification_uri: source.verification_uri as string,
    user_code: source.user_code as string,
    code: (source.code as string) ?? (source.device_code as string),
    interval: (source.interval as number) ?? 5,
  };
}

function parseOAuthTokenResponse(json: Record<string, unknown>): { status: number; message: string; apiKey: string; clientId: string; isSuccess: boolean } {
  // The API returns { success: true, data: { ... }, error, meta, request_id }
  const inner = (json.data ?? json) as Record<string, unknown>;

  // Check for pending/expired messages in data.msg
  const dataMsg = inner.msg as string | undefined;

  if (dataMsg === 'authorization_pending') {
    return { status: 10012, message: '', apiKey: '', clientId: '', isSuccess: false };
  }

  if (dataMsg === 'expired_token') {
    return { status: 10013, message: t('error.oauthExpired'), apiKey: '', clientId: '', isSuccess: false };
  }

  // Check for credentials in either inner (from data: { ... }) or flat
  const apiKey = (inner.api_key as string) ?? (inner.apiKey as string) ?? (json.api_key as string) ?? '';
  const clientId = (inner.client_id as string) ?? (inner.clientId as string) ?? (json.client_id as string) ?? '';
  const message = (json.message as string) ?? (inner.message as string) ?? '';

  if (apiKey && clientId) {
    return { status: 0, message: '', apiKey, clientId, isSuccess: true };
  }

  // Unknown state
  const status = json.status as number | undefined ?? -1;
  return { status, message, apiKey: '', clientId: '', isSuccess: false };
}

export async function pollOAuthToken(
  code: string,
  interval: number,
  signal?: AbortSignal
): Promise<OAuthTokenResponse> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${OPENAPI_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'device_code',
        client_id: 'cli_a1b2c3d4e5f6789012345678abcdef90',
        code,
      }),
      signal,
    });

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (res.status < 200 || res.status >= 300) {
      const text = await res.text();
      throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
    }
    const text = await res.text();
    const json = safeJsonParse(text) as Record<string, unknown>;
    const parsed = parseOAuthTokenResponse(json);

    if (parsed.isSuccess) {
      return { api_key: parsed.apiKey, client_id: parsed.clientId };
    }

    if (parsed.status === 10012) {
      // still pending, wait interval seconds
      await new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(() => resolve(), interval * 1000);
        signal?.addEventListener('abort', () => { window.clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); });
      });
      continue;
    }

    if (parsed.status === 10013) {
      throw new Error(t('error.oauthExpired'));
    }

    const rawMsg = JSON.stringify(json).slice(0, 200);
    throw new Error(
      (parsed.message ? parsed.message + ' ' : '') + t('error.oauthUnknown', { status: parsed.status }) + ` (${rawMsg})`
    );
  }

  throw new Error(t('error.oauthTimeout'));
}

export async function* fetchAllNotes(
  token: string,
  clientId: string,
  signal?: AbortSignal,
  startCursor?: string | null
): AsyncGenerator<GetNoteNote[]> {
  let cursor = startCursor && startCursor !== '0' ? startCursor : '0';

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { notes, hasMore } = await fetchNotes({
      token,
      clientId,
      sinceId: cursor,
      signal,
    });

    if (notes && notes.length > 0) {
      yield notes;
    }

    if (!hasMore || notes.length === 0) break;
    cursor = notes[notes.length - 1].note_id;
  }
}

// Web API async generator for fetching all notes
export async function* fetchAllNotesWebApi(
  webToken: string,
  csrfToken: string,
  signal?: AbortSignal,
  startCursor?: string | null
): AsyncGenerator<GetNoteNote[]> {
  let cursor = startCursor ?? '';

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { notes, hasMore } = await fetchNotesWebApi(webToken, csrfToken, cursor, 20, signal);

    if (notes && notes.length > 0) {
      yield notes;
    }

    if (!hasMore || notes.length === 0) break;
    cursor = notes[notes.length - 1].note_id;
  }
}

// Check if error is OpenAPI member-only error (code: 10201)
export function isMemberOnlyError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('OpenAPI_ONLY_MEMBER') || err.message.includes('10201');
  }
  return false;
}

// Determine which API mode to use based on available credentials
export type EffectiveApiMode = 'openapi' | 'webapi';

export function getEffectiveApiMode(settings: { apiToken: string; clientId: string; webApiToken: string }): EffectiveApiMode {
  if (settings.apiToken && settings.clientId) {
    return 'openapi';
  }
  if (settings.webApiToken) {
    return 'webapi';
  }
  return 'openapi'; // fallback (will fail if credentials missing)
}
