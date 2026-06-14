import { describe, expect, it, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { NoteTypeSelect } from '../src/ui/note-type-select';

function renderSelect(value: string[] | undefined = undefined, onChange = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(h(NoteTypeSelect, { value, onChange }), container);
  return { container, onChange };
}

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = '';
});

describe('NoteTypeSelect', () => {
  it('按官方筛选项展示笔记类型，仅 5 个 group（不含订阅博主）', async () => {
    const { container } = renderSelect();

    await act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const labels = Array.from(container.querySelectorAll('label')).map(label => label.textContent);

    expect(labels).toEqual([
      '全部笔记',
      '文字笔记',
      '图片笔记',
      '链接笔记',
      '录音笔记',
      '其他',
    ]);
  });

  it('取消录音笔记时移除全部 9 种底层 audio 类型', async () => {
    const { container, onChange } = renderSelect();

    await act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const audioOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === '录音笔记');
    expect(audioOption).toBeTruthy();
    const checkbox = audioOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;

    await act(() => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const callArg = onChange.mock.calls.at(-1)![0] as string[];
    expect(callArg).not.toContain('recorder_audio');
    expect(callArg).not.toContain('recorder_flash_audio');
    expect(callArg).not.toContain('immediate_audio');
    expect(callArg).not.toContain('audio_long');
    expect(callArg).not.toContain('local_audio');
    expect(callArg).not.toContain('audio');
    expect(callArg).not.toContain('class_audio');
    expect(callArg).not.toContain('internal_record');
    expect(callArg).not.toContain('meeting');
    expect(callArg).toContain('plain_text');
    expect(callArg).toContain('link');
    expect(callArg).toContain('img_text');
  });
});
