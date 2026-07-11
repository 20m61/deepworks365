# Infrastructure

初期状態では、コストを発生させないResource Groupのみを作成します。各Azureサービスは、ADRとIssueで承認後にAzure Verified Modulesまたは社内標準Bicepモジュールとして追加します。

```bash
az deployment sub what-if \
  --location japaneast \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

原則:

- dev / stg / prodを分離する
- GitHub ActionsからAzureへはOIDCを利用する
- Private Endpoint、Managed Identity、Key Vaultを優先する
- タグとコスト配賦を必須化する
- Azure Policyによる逸脱検知・修復を行う
