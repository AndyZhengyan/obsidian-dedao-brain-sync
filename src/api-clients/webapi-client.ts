import type { GetNoteNote, Attachment } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim();
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: normalizeBearerToken(token),
    'x-request-id': String(Date.now()),
  };
}

function parseWebApiListResponse(value: unknown): { notes: GetNoteNote[]; hasMore: boolean } {
  if (!isRecord(value)) return { notes: [], hasMore: false };
  const c = value.c;
  if (!isRecord(c)) return { notes: [], hasMore: false };
  const list = c.list;
  if (!Array.isArray(list)) return { notes: [], hasMore: false };
  const hasMore = Boolean(c.has_more);
  // Map Web API fields to GetNoteNote
  const notes: GetNoteNote[] = list.map((n): GetNoteNote => ({
    id: n.id as string,
    note_id: n.note_id as string,
    title: (n.title as string) ?? '',
    content: (n.content as string) ?? '',
    note_type: (n.note_type as string) ?? 'plain_text',
    source: (n.source as string) ?? 'web',
    tags: (n.tags as { name: string }[]) ?? [],
    created_at: (n.created_at as string) ?? '',
    updated_at: (n.updated_at as string) ?? '',
    attachments: (n.attachments as Attachment[]) ?? [],
    audio: (n.audio as string) ?? undefined,
  }));
  return { notes, hasMore };
}

function normalizeNoteDetailData(value: unknown): Partial<GetNoteNote> | null {
  if (!isRecord(value)) return null;
  const nestedNote = isRecord(value.note) ? value.note : null;
  const source = nestedNote ?? value;
  const detail = { ...source } as Partial<GetNoteNote>;
  const attachments = (value.attachments ?? source.attachments) as Attachment[] | undefined;
  const audio = typeof (value.audio ?? source.audio) === 'string' ? (value.audio ?? source.audio) as string : undefined;
  return { ...detail, attachments, audio };
}

async function apiRequest<T>(url: string, options: RequestInit, retries = 1, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const res = await fetch(url, { ...options, signal });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (res.status === 401) throw new Error('API Token 无效，请检查设置');
  if (res.status === 429) throw new Error('API 配额已用完，请明天再试');
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(`API 错误 ${res.status}: ${text}`);
  }
  const text = await res.text();
  return JSON.parse(text) as T;
}

export interface FetchNotesOptions {
  token: string;
  sinceId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchNotes(options: FetchNotesOptions): Promise<{ notes: GetNoteNote[]; hasMore: boolean }> {
  const { token, sinceId = '0', limit, signal } = options;
  const params = new URLSearchParams();
  params.set('limit', String(limit ?? 20));
  params.set('since_id', sinceId === '0' ? '' : sinceId);
  params.set('sort', 'create_desc');
  const url = `https://get-notes.luojilab.com/voicenotes/web/notes?${params.toString()}`;
  const data = await apiRequest<{ h?: unknown; c?: unknown }>(url, {
    method: 'GET',
    headers: buildHeaders(token),
  }, 3, signal);
  return parseWebApiListResponse(data);
}

export async function fetchNoteDetail(
  detailId: string,
  token: string,
  signal?: AbortSignal
): Promise<Partial<GetNoteNote>> {
  const url = `https://get-notes.luojilab.com/voicenotes/web/notes/${encodeURIComponent(detailId)}`;
  const data = await apiRequest<{ h?: unknown; c?: unknown; message?: string }>(url, {
    method: 'GET',
    headers: buildHeaders(token),
  }, 2, signal);
  // Web API detail: data is in .c, not .data
  if (data.message) throw new Error(data.message);
  const c = data.c;
  if (!isRecord(c)) throw new Error('Failed to parse note detail');
  const noteDetail = normalizeNoteDetailData(c);
  if (!noteDetail) throw new Error('Failed to parse note detail');
  return noteDetail;
}