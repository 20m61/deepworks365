import type { Transcript } from '../../src/index.js';

export const sampleTranscript: Transcript = {
  meetingId: 'm1',
  title: 'Sprint Planning',
  utterances: [
    { id: 'u1', speaker: 'Alice', text: '合意: 次期リリースは7月末' },
    { id: 'u2', speaker: 'Bob', text: 'TODO: CI設定をレビューする' },
    { id: 'u3', speaker: 'Carol', text: '予算はどうする?' },
    { id: 'u4', speaker: 'Alice', text: '未決: 採用計画の承認者' },
    { id: 'u5', speaker: 'Bob', text: '雑談です' },
  ],
};
