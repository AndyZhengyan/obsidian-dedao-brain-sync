import { issuedNotices, resetIssuedNotices } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { showError, showInfo, showNotice, showSuccess } from '../src/ui/notice';

describe('notice helpers', () => {
  beforeEach(() => {
    resetIssuedNotices();
  });

  it('shows plain notices with the app prefix and default timeout', () => {
    showNotice('同步完成');

    expect(issuedNotices).toEqual([
      { message: '[得到大脑] 同步完成', timeout: 5000 },
    ]);
  });

  it('passes a custom plain-notice timeout through to Obsidian Notice', () => {
    showNotice('同步完成', 10000);

    expect(issuedNotices).toEqual([
      { message: '[得到大脑] 同步完成', timeout: 10000 },
    ]);
  });

  it('shows errors with the error marker, app prefix, and longer default timeout', () => {
    showError('Token 无效');

    expect(issuedNotices).toEqual([
      { message: '❌ [得到大脑] Token 无效', timeout: 7000 },
    ]);
  });

  it('shows successes with the success marker, app prefix, and default timeout', () => {
    showSuccess('新增 3 条笔记');

    expect(issuedNotices).toEqual([
      { message: '✅ [得到大脑] 新增 3 条笔记', timeout: 5000 },
    ]);
  });

  it('shows info notices with the app prefix and shorter default timeout', () => {
    showInfo('提示信息');

    expect(issuedNotices).toEqual([
      { message: '[得到大脑] 提示信息', timeout: 4000 },
    ]);
  });
});
