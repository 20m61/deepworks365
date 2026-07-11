# 共通ドメインモデル

## 中核エンティティ

- Organization / Department / Team / Person / Role
- Strategy / Objective / KPI / Initiative / Portfolio
- Project / Workstream / Milestone / Dependency
- Meeting / Conversation / Issue / Option / Decision / Approval
- Task / Worklog / Deliverable / Document
- Standard / Policy / Control / Exception
- Risk / Incident / Metric / HealthSnapshot
- Evidence / Insight / Hypothesis / Lesson
- Agent / AgentRun / Recommendation / Evaluation

## 情報状態

`confirmed_fact`, `approved_decision`, `official_plan`, `human_reported`, `ai_inferred`, `hypothesis`, `unverified`, `conflicted`, `expired`

## 原則

- AI推定を正式状態へ上書きしない
- 重要数値は構造化データを正とし、文書へ投影する
- 全エンティティに所有者、基準日、機密区分、根拠、バージョンを持たせる
- 関連の存在自体もアクセス制御対象とする
