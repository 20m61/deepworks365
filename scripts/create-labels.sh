#!/usr/bin/env bash
set -euo pipefail
REPO="${GITHUB_OWNER:-20m61}/${GITHUB_REPO:-deepworks365}"
labels=(
  'status:triage|d4c5f9|未整理'
  'status:ready|0e8a16|着手可能'
  'type:epic|5319e7|エピック'
  'type:feature|1d76db|機能'
  'type:research|bfdadc|調査'
  'type:security|b60205|セキュリティ'
  'type:operations|0052cc|運用'
  'type:documentation|0075ca|文書'
  'priority:p0|b60205|最優先'
  'priority:p1|d93f0b|高'
  'priority:p2|fbca04|中'
  'priority:p3|c2e0c6|低'
  'area:identity|0366d6|ID・権限'
  'area:context|7057ff|文脈・オントロジー'
  'area:decision|8a2be2|意思決定'
  'area:health|0e8a16|プロジェクトヘルス'
  'area:agents|a2eeef|エージェント'
  'area:ux|f9d0c4|UX・可視化'
  'area:platform|006b75|プラットフォーム'
  'area:security|d73a4a|セキュリティ'
  'area:finops|c5def5|FinOps'
)
for spec in "${labels[@]}"; do
  IFS='|' read -r name color description <<<"$spec"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force
done
