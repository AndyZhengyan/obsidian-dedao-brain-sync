import type { ListResponse, GetNoteNote } from './types';

const BASE_URL = 'https://openapi.biji.com/open/api/v1';

/**
 * Get笔记 API 返回的 id 字段是 64 位整数，直接 JSON.parse 会丢失精度。
 * 在解析前将所有 id 相关字段从数字转为字符串。
 */
function safeJsonParse(text: string): unknown {
  const safe = text.replace(
    /"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g,
    '"$1":"$2"'
  );
  return JSON.parse(safe);
}

async function apiRequest<T>(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    throw new Error('API Token 或 Client ID 无效，请检查设置');
  }

  if (res.status === 429 && retries > 0) {
    // 429: 指数退避重试
    const delay = Math.pow(2, 3 - retries) * 1000;
    await new Promise(r => setTimeout(r, delay));
    return apiRequest(url, options, retries - 1);
  }

  if (!res.ok) {
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
}

export async function fetchNotes(options: FetchNotesOptions): Promise<{
  notes: GetNoteNote[];
  hasMore: boolean;
  nextCursor: string;
}> {
  const { token, clientId, sinceId = '0', limit = 50 } = options;

  const url = `${BASE_URL}/resource/note/list?since_id=${sinceId}&limit=${limit}`;

  const data = await apiRequest<ListResponse>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-ID': clientId,
    },
  });

  return {
    notes: data.data.notes,
    hasMore: data.data.has_more,
    nextCursor: data.data.next_cursor,
  };
}

/**
 * 分页获取所有笔记（generator 形式）
 */
export async function* fetchAllNotes(
  token: string,
  clientId: string
): AsyncGenerator<GetNoteNote[]> {
  let cursor = '0';

  while (true) {
    const { notes, hasMore, nextCursor } = await fetchNotes({
      token,
      clientId,
      sinceId: cursor,
    });

    yield notes;

    if (!hasMore || !nextCursor || notes.length === 0) break;
    cursor = nextCursor;
  }
}
