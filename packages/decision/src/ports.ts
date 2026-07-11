import type { Transcript, AgreementCandidate, OpenIssue, TaskCandidate, Candidate, CandidateKind, InformationState, ApprovalMeta, DeliveryRef, LedgerEntry } from './types.js';
export interface ExtractionResult { agreements: AgreementCandidate[]; issues: OpenIssue[]; tasks: TaskCandidate[]; }
export interface ExtractPort { extract(t: Transcript): Promise<ExtractionResult>; }
export interface AppendInput {
  meetingId: string; kind: CandidateKind; state: InformationState; payload: Candidate;
  owner: string; recordedAt: string; supersedes?: string; approval?: ApprovalMeta; deliveryRef?: DeliveryRef;
}
export interface LedgerRepository {
  append(input: AppendInput): Promise<LedgerEntry>;
  get(id: string): Promise<LedgerEntry | null>;
  getByMeeting(meetingId: string): Promise<LedgerEntry[]>;
}
export interface DeliveryPort { deliver(task: TaskCandidate): Promise<DeliveryRef>; }
