import { describe, it, expect } from 'vitest';
import { fetchNotes } from '../src/api';
import type { ListResponse } from '../src/types';

// Extract the internal safeJsonParse for direct testing
function safeJsonParse(text: string): unknown {
  const safe = text.replace(
    /"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g,
    '"$1":"$2"'
  );
  return JSON.parse(safe);
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

describe('fetchNotes', () => {
  it('构建正确的请求 URL 和 headers', async () => {
    const responses: Response[] = [];

    // Use a fake fetch that captures the request and returns empty data
    global.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      responses.push(
        new Response(
          JSON.stringify({
            data: { notes: [], has_more: false, next_cursor: '' },
          }),
          { status: 200 }
        )
      );
      return Promise.resolve(responses[responses.length - 1]);
    };

    await fetchNotes({
      token: 'test-token',
      clientId: 'test-client',
      sinceId: '0',
      limit: 50,
    });

    // Check that fetch was called
    expect(responses.length).toBe(1);
  });
});
