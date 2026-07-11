import type { ExtractPort, ExtractionResult } from '../ports.js';
import type { Transcript, Utterance, SourceRef, AgreementCandidate, OpenIssue, TaskCandidate } from '../types.js';

function refOf(t: Transcript, u: Utterance): SourceRef {
  return { meetingId: t.meetingId, utteranceId: u.id, speaker: u.speaker, text: u.text };
}

// 決定論マーカー抽出 (旧 LLM の代替 fake)。副作用なし・分類のみ (非交渉ルール3)。
export const markerExtractor: ExtractPort = {
  async extract(t: Transcript): Promise<ExtractionResult> {
    const agreements: AgreementCandidate[] = [];
    const issues: OpenIssue[] = [];
    const tasks: TaskCandidate[] = [];
    for (const u of t.utterances) {
      const text = u.text.trim();
      const basis = [refOf(t, u)];
      if (/^(合意|決定)[:：]/.test(text)) {
        agreements.push({ id: `${t.meetingId}:${u.id}:agreement`, kind: 'agreement', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      } else if (/^(TODO|タスク)[:：]/i.test(text)) {
        tasks.push({ id: `${t.meetingId}:${u.id}:task`, kind: 'task', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      } else if (/^未決[:：]/.test(text) || text.endsWith('?') || text.endsWith('？')) {
        issues.push({ id: `${t.meetingId}:${u.id}:issue`, kind: 'issue', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      }
    }
    return { agreements, issues, tasks };
  },
};
