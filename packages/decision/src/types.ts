export type InformationState =
  | 'ai_inferred' | 'hypothesis' | 'human_reported'
  | 'confirmed_fact' | 'approved_decision' | 'unverified' | 'conflicted';
export type CandidateKind = 'agreement' | 'issue' | 'task';
export interface SourceRef { meetingId: string; utteranceId: string; speaker?: string; text: string; }
export interface CandidateBase { id: string; meetingId: string; text: string; basis: SourceRef[]; state: InformationState; }
export interface AgreementCandidate extends CandidateBase { kind: 'agreement'; confidence?: number; }
export interface OpenIssue extends CandidateBase { kind: 'issue'; }
export interface TaskCandidate extends CandidateBase { kind: 'task'; assigneeHint?: string; dueHint?: string; }
export type Candidate = AgreementCandidate | OpenIssue | TaskCandidate;
export interface Utterance { id: string; speaker: string; text: string; }
export interface Transcript { meetingId: string; title?: string; utterances: Utterance[]; }
export interface ApprovalMeta { approver: string; approvedAt: string; basis: string; conditions?: string; }
export interface DeliveryRef { system: string; externalId: string; }
export interface LedgerEntry {
  id: string; meetingId: string; kind: CandidateKind; state: InformationState;
  payload: Candidate; version: number; owner: string; recordedAt: string;
  supersedes?: string; approval?: ApprovalMeta; deliveryRef?: DeliveryRef;
}
