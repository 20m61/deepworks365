# AppSecパイプライン

## PRゲート

1. 構文・フォーマット・単体テスト
2. Semgrep CE: 組織固有ルール、SAST、Secrets
3. CodeQL: 深いデータフロー分析
4. Dependency Review / Dependabot: 依存関係差分
5. Bicep build / Azure Policy確認
6. AI品質評価: 根拠性、権限逸脱、重大誤り

## 継続検査

- OWASP ZAP Baseline: プレビュー/検証環境へ受動スキャン
- 認証付きDAST: 専用環境とテストアカウント
- SBOM生成と脆弱性監視
- 定期的な脅威モデリングと侵入テスト
- OWASP ASVSへの要件マッピング

## 検出結果の扱い

- Critical / Highは原則マージ禁止
- 例外には責任者、根拠、期限、代替統制、追跡Issueを必須とする
- 誤検知の抑制は設定変更PRとしてレビューする
- 結果を隠すためにテストやルールを削除しない
