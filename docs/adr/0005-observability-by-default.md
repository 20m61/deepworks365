# ADR: オブザーバビリティを初期要件とする

- Status: Accepted
- Date: 2026-07-11

## Context

本プロジェクトの規模、セキュリティ、運用効率を考慮し、早期に一貫した判断が必要。

## Decision

OpenTelemetry、Trace ID、SLO、AI品質、コスト配賦を後付けにしない。

## Consequences

- 実装とレビューの基準が明確になる
- 初期の設計作業は増えるが、後工程の手戻りと属人化を減らす
