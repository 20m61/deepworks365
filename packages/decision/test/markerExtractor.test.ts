import { describe, expect, it } from 'vitest';
import { markerExtractor } from '../src/extract/markerExtractor.js';
import { sampleTranscript } from './fixtures/transcript.js';

describe('markerExtractor', () => {
  it('マーカーで種別に振り分け、basis と ai_inferred を付ける', async () => {
    const r = await markerExtractor.extract(sampleTranscript);
    expect(r.agreements.map((a) => a.text)).toEqual(['合意: 次期リリースは7月末']);
    expect(r.tasks.map((t) => t.text)).toEqual(['TODO: CI設定をレビューする']);
    expect(r.issues.map((i) => i.text).sort()).toEqual(['未決: 採用計画の承認者', '予算はどうする?'].sort());
    const a = r.agreements[0];
    expect(a.kind).toBe('agreement');
    expect(a.state).toBe('ai_inferred');
    expect(a.basis).toEqual([{ meetingId: 'm1', utteranceId: 'u1', speaker: 'Alice', text: '合意: 次期リリースは7月末' }]);
    expect(a.id).toBe('m1:u1:agreement');
  });
  it('マーカー無し発言は候補にしない', async () => {
    const r = await markerExtractor.extract(sampleTranscript);
    const all = [...r.agreements, ...r.issues, ...r.tasks].map((c) => c.text);
    expect(all).not.toContain('雑談です');
  });
});
