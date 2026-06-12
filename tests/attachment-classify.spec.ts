import { describe, it, expect } from 'vitest';
import { classifyAttachmentUrl, isAttachmentTypeEnabled } from '../src/utils/attachments';
import type { AttachmentImportSettings } from '../src/types';

describe('classifyAttachmentUrl', () => {
  it.each([
    ['https://cdn.example.com/photo.png', 'image'],
    ['https://cdn.example.com/photo.JPG', 'image'],
    ['https://cdn.example.com/photo.webp', 'image'],
    ['https://cdn.example.com/photo.svg', 'image'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifyAttachmentUrl(url)).toBe(expected);
  });

  it.each([
    ['https://cdn.example.com/voice.mp3', 'audio'],
    ['https://cdn.example.com/voice.m4a', 'audio'],
    ['https://cdn.example.com/voice.wav', 'audio'],
    ['https://cdn.example.com/voice.aac', 'audio'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifyAttachmentUrl(url)).toBe(expected);
  });

  it.each([
    ['https://cdn.example.com/clip.mp4', 'video'],
    ['https://cdn.example.com/clip.mov', 'video'],
    ['https://cdn.example.com/clip.webm', 'video'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifyAttachmentUrl(url)).toBe(expected);
  });

  it.each([
    ['https://cdn.example.com/lecture.pdf', 'document'],
    ['https://cdn.example.com/slides.pptx', 'document'],
    ['https://cdn.example.com/sheet.xlsx', 'document'],
    ['https://cdn.example.com/notes.txt', 'document'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifyAttachmentUrl(url)).toBe(expected);
  });

  it('falls back to "other" for unknown extensions', () => {
    expect(classifyAttachmentUrl('https://cdn.example.com/file.xyz')).toBe('other');
    expect(classifyAttachmentUrl('https://cdn.example.com/no-extension')).toBe('other');
  });

  it('ignores query string when classifying', () => {
    expect(classifyAttachmentUrl('https://cdn.example.com/photo.png?token=abc&w=200')).toBe('image');
    expect(classifyAttachmentUrl('https://cdn.example.com/clip.mp4?X-Amz-Signature=xyz')).toBe('video');
  });

  it('handles URLs with paths containing dots', () => {
    expect(classifyAttachmentUrl('https://cdn.example.com/v1.2/photo.png')).toBe('image');
  });
});

describe('isAttachmentTypeEnabled', () => {
  const allOn: AttachmentImportSettings = { image: true, audio: true, video: true, document: true };
  const onlyImage: AttachmentImportSettings = { image: true, audio: false, video: false, document: false };
  const defaults: AttachmentImportSettings = allOn;

  it('returns true when the matching type is enabled', () => {
    expect(isAttachmentTypeEnabled(allOn, 'image')).toBe(true);
    expect(isAttachmentTypeEnabled(allOn, 'audio')).toBe(true);
    expect(isAttachmentTypeEnabled(allOn, 'video')).toBe(true);
    expect(isAttachmentTypeEnabled(allOn, 'document')).toBe(true);
  });

  it('returns false when the matching type is disabled', () => {
    expect(isAttachmentTypeEnabled(onlyImage, 'audio')).toBe(false);
    expect(isAttachmentTypeEnabled(onlyImage, 'video')).toBe(false);
    expect(isAttachmentTypeEnabled(onlyImage, 'document')).toBe(false);
  });

  it('treats "other" attachments as always enabled (no setting controls them)', () => {
    expect(isAttachmentTypeEnabled(onlyImage, 'other')).toBe(true);
  });

  it('defaults to enabled when the settings object is empty (defensive — main.tsx backfills defaults)', () => {
    const empty = {} as AttachmentImportSettings;
    expect(isAttachmentTypeEnabled(empty, 'image')).toBe(true);
    expect(isAttachmentTypeEnabled(empty, 'audio')).toBe(true);
    expect(isAttachmentTypeEnabled(empty, 'video')).toBe(true);
    expect(isAttachmentTypeEnabled(empty, 'document')).toBe(true);
  });

  it('respects explicit false on any individual key', () => {
    const partialOff: AttachmentImportSettings = { ...defaults, document: false };
    expect(isAttachmentTypeEnabled(partialOff, 'document')).toBe(false);
    expect(isAttachmentTypeEnabled(partialOff, 'image')).toBe(true);
  });
});
