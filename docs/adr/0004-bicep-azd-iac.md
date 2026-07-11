# ADR: Bicep + azdをAzure IaC標準とする

- Status: Accepted
- Date: 2026-07-11

## Context

本プロジェクトの規模、セキュリティ、運用効率を考慮し、早期に一貫した判断が必要。

## Decision

Azureネイティブ、状態ファイル不要、Verified Modulesと組み合わせて少人数運用を実現する。

## Consequences

- 実装とレビューの基準が明確になる
- 初期の設計作業は増えるが、後工程の手戻りと属人化を減らす
