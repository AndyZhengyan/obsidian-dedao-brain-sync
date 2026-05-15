import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNotes, fetchNoteDetail, fetchNotesWebApi, fetchAllNotesWebApi, getEffectiveApiMode, isMemberOnlyError } from '../src/api';
import type { ListResponse } from '../src/types';

// Extract the internal safeJsonParse for direct testing
function safeJsonParse(text: string): unknown {
  const safe = text.replace(
    /"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g,
    '"$1":"$2"'
  );
  return JSON.parse(safe);
}

function mockFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

describe('safeJsonParse', () => {
  it('将大整数 id 字段转为字符串以防止精度丢失', () => {
    const input = '{"id":9007199254740999,"note_id":123456789012345678,"title":"test"}';
    const result = safeJsonParse(input) as Record<string, unknown>;
    expect(typeof result.id).toBe('string');
    expect(result.id).toBe('9007199254740999');
    expect(typeof result.note_id).toBe('string');
    expect(result.note_id).toBe('123456789012345678');
    expect(result.title).toBe('test');
  });

  it('小整数 id 也转为字符串', () => {
    const input = '{"id":42,"name":"test"}';
    const result = safeJsonParse(input) as Record<string, unknown>;
    expect(typeof result.id).toBe('string');
    expect(result.id).toBe('42');
  });

  it('parent_id 和 follow_id 也转为字符串', () => {
    const input = '{"parent_id":999888777,"follow_id":666555444,"live_id":333222111}';
    const result = safeJsonParse(input) as Record<string, unknown>;
    expect(typeof result.parent_id).toBe('string');
    expect(result.parent_id).toBe('999888777');
    expect(typeof result.follow_id).toBe('string');
    expect(result.follow_id).toBe('666555444');
    expect(typeof result.live_id).toBe('string');
    expect(result.live_id).toBe('333222111');
  });

  it('不含 id 字段的 JSON 照常解析', () => {
    const input = '{"name":"test","value":100}';
    const result = safeJsonParse(input) as Record<string, unknown>;
    expect(result.name).toBe('test');
    expect(result.value).toBe(100);
  });

  it('数组中嵌套的对象也正确处理', () => {
    const input =
      '{"data":{"notes":[{"id":9999999999999999,"title":"note1"},{"id":8888888888888888,"title":"note2"}]}}';
    const result = safeJsonParse(input) as Record<string, unknown>;
    const data = result.data as { notes: Array<{ id: string; title: string }> };
    expect(data.notes[0].id).toBe('9999999999999999');
    expect(data.notes[1].id).toBe('8888888888888888');
  });

  it('处理空对象', () => {
    expect(safeJsonParse('{}')).toEqual({});
  });

  it('处理空数组', () => {
    expect(safeJsonParse('[]')).toEqual([]);
  });
});

describe('fetchNoteDetail', () => {
  it('返回指定 id 的笔记详情，包含 attachments 字段', async () => {
    const mockResponse = {
      success: true,
      data: {
        id: '1908723638246504120',
        note_id: '1908723638246504120',
        title: '测试录音',
        content: 'AI 摘要',
        note_type: 'recorder_audio',
        source: 'app',
        tags: [],
        attachments: [
          {
            type: 'audio',
            url: 'https://mediacdn.umiwi.com/voicenotes%2Ftest.mp3?Expires=1778291785&Signature=abc',
            title: '',
            duration: 883920,
          },
        ],
        audio: '🟢 说话人1 [00:00:01]\n测试内容',
        created_at: '2026-04-30 12:45:24',
        updated_at: '2026-04-30 13:00:07',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(mockResponse) as Response);

    try {
      const result = await fetchNoteDetail('1908723638246504120', 'test-token', 'test-client');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments![0].type).toBe('audio');
      expect(result.audio).toContain('说话人1');
    } finally {
      vi.mocked(globalThis.fetch).mockRestore();
    }
  });

  it('兼容详情接口 data.note + data.audio.original 的嵌套结构', async () => {
    const mockResponse = {
      success: true,
      data: {
        note: {
          id: '1909428570156704824',
          note_id: '1909428570156704824',
          title: '嵌套录音',
          content: 'AI 摘要',
          note_type: 'recorder_audio',
          source: 'app',
          tags: [],
          created_at: '2026-05-09 10:00:00',
          updated_at: '2026-05-09 10:05:00',
        },
        attachments: [
          { type: 'audio', url: 'https://cdn.example.com/audio.mp3', title: '', duration: 300000 },
        ],
        audio: {
          original: '🟢 说话人1 [00:00:01]\n嵌套转写',
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(mockResponse) as Response);

    try {
      const result = await fetchNoteDetail('1909428570156704824', 'test-token', 'test-client');
      expect(result.title).toBe('嵌套录音');
      expect(result.attachments).toHaveLength(1);
      expect(result.audio).toBe('🟢 说话人1 [00:00:01]\n嵌套转写');
    } finally {
      vi.mocked(globalThis.fetch).mockRestore();
    }
  });

  it('笔记不存在时抛出错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ success: false, error: { message: '笔记不存在' } }) as Response
    );

    try {
      await expect(fetchNoteDetail('not-exist', 'test-token', 'test-client')).rejects.toThrow('笔记不存在');
    } finally {
      vi.mocked(globalThis.fetch).mockRestore();
    }
  });
});

describe('fetchNotes limit', () => {
  function mockListResponse() {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        data: { notes: [], has_more: false, next_cursor: '' },
      }) as Response
    );
  }

  it('默认请求不带 limit 参数（API 最大 20 条）', async () => {
    mockListResponse();

    try {
      await fetchNotes({ token: 'test-token', clientId: 'test-client' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.not.stringContaining('limit='),
        expect.any(Object)
      );
    } finally {
      vi.mocked(globalThis.fetch).mockRestore();
    }
  });

  it('limit 参数不再传递到 URL（已移除）', async () => {
    mockListResponse();

    try {
      await fetchNotes({ token: 'test-token', clientId: 'test-client', limit: 50 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.not.stringContaining('limit='),
        expect.any(Object)
      );
    } finally {
      vi.mocked(globalThis.fetch).mockRestore();
    }
  });
});

describe('Web API functions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockReset();
  });

  function mockWebApiResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(body)),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response;
  }

  it('getEffectiveApiMode prefers OpenAPI when available', () => {
    const mode = getEffectiveApiMode({
      apiToken: 'token',
      clientId: 'client',
      webApiToken: 'web',
    });
    expect(mode).toBe('openapi');
  });

  it('getEffectiveApiMode falls back to WebAPI when no OpenAPI token', () => {
    const mode = getEffectiveApiMode({
      apiToken: '',
      clientId: '',
      webApiToken: 'web',
    });
    expect(mode).toBe('webapi');
  });

  it('isMemberOnlyError detects 10201 error', () => {
    expect(isMemberOnlyError(new Error('OpenAPI_ONLY_MEMBER'))).toBe(true);
    expect(isMemberOnlyError(new Error('something 10201 something'))).toBe(true);
    expect(isMemberOnlyError(new Error('other error'))).toBe(false);
  });

  it('isMemberOnlyError returns false for non-Error', () => {
    expect(isMemberOnlyError({ message: 'OpenAPI_ONLY_MEMBER' } as Error)).toBe(false);
    expect(isMemberOnlyError('OpenAPI_ONLY_MEMBER')).toBe(false);
    expect(isMemberOnlyError(null)).toBe(false);
  });

  it('fetchNotesWebApi returns normalized notes', async () => {
    const mockResponse = {
      h: { c: 200, e: '', s: 1, t: 1234567890, apm: '' },
      c: {
        total_items: 2,
        list: [
          {
            id: '1',
            note_id: '123456789012345678',
            source: 'app',
            entry_type: 'recorder',
            note_type: 'recorder_audio',
            title: 'Test Note',
            json_content: '{}',
            content: 'Test content',
            body_text: 'Test body',
            ref_content: '',
            topics: [],
            book_topics: [],
            tags: [{ id: '1', name: 'tag1', type: 'user', visible: true, is_deleted: 0, create_time: 0, update_time: 0, tag_type: 'user' }],
            is_ai_generated: false,
            attachments: [{ type: 'audio', url: 'https://cdn.example.com/audio.mp3', size: 1024, title: 'audio', sub_title: '', duration: 60000, favicon: '' }],
            edit_time: '2026-05-01 00:00:00',
            created_at: '2026-05-01 12:00:00',
            updated_at: '2026-05-01 12:00:00',
            version: 1,
            status: 1,
            display_status: 1,
            share_scope: 0,
            is_author: true,
          },
        ],
        has_more: false,
        next_cursor: '',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockWebApiResponse(mockResponse) as Response);

    try {
      const result = await fetchNotesWebApi('web-token', 'csrf-token');
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Test Note');
      expect(result.notes[0].id).toBe(123456789012345678); // parsed from note_id
      expect(result.notes[0].note_id).toBe('123456789012345678');
      expect(result.notes[0].tags).toEqual([{ name: 'tag1' }]);
      expect(result.notes[0].attachments).toEqual([{ type: 'audio', url: 'https://cdn.example.com/audio.mp3', title: 'audio', duration: 60000 }]);
      expect(result.hasMore).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fetchNotesWebApi throws on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockWebApiResponse({}, 401) as Response);

    try {
      await expect(fetchNotesWebApi('bad-token', 'csrf-token')).rejects.toThrow();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fetchNotesWebApi throws on non-2xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockWebApiResponse({ message: 'server error' }, 500) as Response);

    try {
      await expect(fetchNotesWebApi('web-token', 'csrf-token')).rejects.toThrow();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fetchAllNotesWebApi yields multiple pages', async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      const hasMore = callCount < 3;
      return mockWebApiResponse({
        h: { c: 200, e: '', s: 1, t: 1234567890, apm: '' },
        c: {
          total_items: 6,
          list: [{ id: String(callCount), note_id: String(callCount * 1000), source: 'app', entry_type: 'recorder', note_type: 'recorder_audio', title: `Note ${callCount}`, json_content: '{}', content: '', body_text: '', ref_content: '', topics: [], book_topics: [], tags: [], is_ai_generated: false, attachments: [], edit_time: '', created_at: '', updated_at: '', version: 1, status: 1, display_status: 1, share_scope: 0, is_author: true }],
          has_more: hasMore,
          next_cursor: hasMore ? String(callCount * 1000) : '',
        },
      }) as Response;
    });

    try {
      const generator = fetchAllNotesWebApi('web-token', 'csrf-token');
      const results: unknown[][] = [];

      let next = await generator.next();
      while (!next.done) {
        results.push(next.value);
        next = await generator.next();
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(1);
      expect(results[2]).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});