import type { GetNoteNote, Attachment } from '../types';

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

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim();
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

function buildHeaders(token: string, clientId: string): Record<string, string> {
  return {
    Authorization: normalizeBearerToken(token),
    'X-Client-ID': clientId,
  };
}

function normalizeListData(value: unknown): { notes: GetNoteNote[]; hasMore: boolean } {
  if (!isRecord(value)) return { notes: [], hasMore: false };
  const data = isRecord(value.data) ? value.data : value;
  const notes = Array.isArray(data.notes) ? data.notes as GetNoteNote[] : [];
  const hasMore = Boolean(data.has_more ?? data.hasMore);
  return { notes, hasMore };
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
  return { ...detail, attachments, audio };
}

async function apiRequest<T>(url: string, options: RequestInit, retries = 1, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const res = await fetch(url, { ...options, signal });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (res.status === 401) throw new Error('API Token 或 Client ID 无效，请检查设置');
  if (res.status === 429) throw new Error('API 配额已用完，请明天再试');
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(`API 错误 ${res.status}: ${text}`);
  }
  const text = await res.text();
  return safeJsonParse(text) as T;
}

export interface FetchNotesOptions {
  token: string;
  clientId: string;
  sinceId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchNotes(options: FetchNotesOptions): Promise<{ notes: GetNoteNote[]; hasMore: boolean }> {
  const { token, clientId, sinceId = '0', limit, signal } = options;
  const params = new URLSearchParams();
  params.set('since_id', sinceId);
  const url = `https://openapi.biji.com/open/api/v1/resource/note/list?${params.toString()}`;
  const data = await apiRequest<{ data?: { notes: GetNoteNote[]; has_more: boolean } }>(
    url, { method: 'GET', headers: buildHeaders(token, clientId) }, 3, signal
  );
  return normalizeListData(data);
}

export async function fetchNoteDetail(
  id: string,
  token: string,
  clientId: string,
  signal?: AbortSignal
): Promise<Partial<GetNoteNote>> {
  const url = `https://openapi.biji.com/open/api/v1/resource/note/detail?id=${encodeURIComponent(id)}`;
  const data = await apiRequest<{
    success?: boolean;
    data?: unknown;
    error?: { message: string };
  }>(url, { method: 'GET', headers: buildHeaders(token, clientId) }, 2, signal);
  const detailData = (data.data ?? data) as Record<string, unknown>;
  if (data.success === false || !detailData) {
    throw new Error((data.error as { message?: string })?.message ?? 'Failed to fetch note detail');
  }
  const noteDetail = normalizeNoteDetailData(detailData);
  if (!noteDetail) throw new Error('Failed to parse note detail');
  return noteDetail;
}