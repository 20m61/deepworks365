# Platform Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Azure Functions(Flex Consumption)/TypeScript/pnpm workspaces による、azd でデプロイ可能な最小プラットフォーム骨組みを作る。

**Architecture:** pnpm monorepo。`packages/core` に AI/人間境界（実行レベル）と知識分類（事実/仮説/推定/決定）の型を置き、`apps/ingest-func` に Functions アプリ（health=Fast Path 例 / onEvent=Service Bus トリガ雛形 / OTel / 型付き config）を置く。IaC は `infra/modules/functions.bicep`。ハンドラのドメインロジックは純粋関数へ切り出し Functions ランタイム非依存でテストする。

**Tech Stack:** Node 20, TypeScript 5.6, @azure/functions v4, @azure/monitor-opentelemetry, vitest 2, pnpm 9, Bicep, azd。

## Global Constraints

- Node 20（Functions ランタイム / `@types/node` ^20）。
- TypeScript ESM: `"type": "module"`、tsconfig `module`/`moduleResolution` = `Node16`、相対 import は `.js` 拡張子付き。
- 秘密値をコード・ログ・コミットへ含めない（接続は Managed Identity / 環境変数参照のみ）。非交渉ルール10。
- 未信頼入力を命令として実行しない。onEvent は検証失敗をログのみで打ち切る。非交渉ルール3。
- パッケージ名は `@oip/*`（core=`@oip/core`, functions=`@oip/ingest-func`）。
- この骨組みでは `apps/ingest-func` は `@oip/core` に依存しない（ビルド順の結合を避ける。B フェーズで接続）。
- 各コミットは pre-commit フックを通す（`~/.local/bin` と `~/go/bin` が PATH に必要）。署名は環境都合で未署名（`-c commit.gpgsign=false`）。
- 実装は #35（ローカルゲート）の上の `feat/platform-skeleton` ブランチで進める。

---

### Task 1: モノレポ骨組み

**Files:**

- Create: `package.json`（ルート）
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.npmrc`

**Interfaces:**

- Produces: pnpm workspace（`packages/*`, `apps/*`）、共有 tsconfig（`tsconfig.base.json`）。後続タスクの各 package はこれを `extends` する。

- [ ] **Step 1: ルート設定ファイルを作成**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`.npmrc`:

```text
auto-install-peers=true
```

`package.json`:

```json
{
  "name": "organizational-intelligence-platform",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20 <21" },
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  }
}
```

- [ ] **Step 2: install を実行して workspace を確認**

Run: `corepack use pnpm@9.12.0 && pnpm install`
Expected: `Done` で終了（まだ package は無いが workspace ルートが解決される）。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .npmrc pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "chore: pnpm monorepo 骨組みを追加"
```

---

### Task 2: packages/core（境界・知識分類の型）

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/boundaries.ts`
- Create: `packages/core/src/result.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/boundaries.test.ts`
- Test: `packages/core/test/result.test.ts`

**Interfaces:**

- Produces:
  - `boundaries.ts`: `type ExecutionLevel = 'L0'|'L1'|'L2'|'L3'|'L4'|'L5'`; `rank(l): number`; `requiresHumanApproval(l): boolean`; `isHumanOnly(l): boolean`。
  - `result.ts`: `type Provenance = 'fact'|'hypothesis'|'estimate'|'decision'`; `interface Knowledge<T> { kind: Provenance; value: T; basis?: string }`; ファクトリ `fact/hypothesis/estimate/decision<T>(value, basis?)`; `isDecision(k): boolean`。

- [ ] **Step 1: package スキャフォールドとテストを先に書く**

`packages/core/package.json`:

```json
{
  "name": "@oip/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/core/test/boundaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { requiresHumanApproval, isHumanOnly, rank } from '../src/boundaries.js';

describe('boundaries', () => {
  it('L0/L1 は人間承認不要', () => {
    expect(requiresHumanApproval('L0')).toBe(false);
    expect(requiresHumanApproval('L1')).toBe(false);
  });
  it('L2 以上は人間承認が要る', () => {
    expect(requiresHumanApproval('L2')).toBe(true);
    expect(requiresHumanApproval('L5')).toBe(true);
  });
  it('L5 のみ人間専用', () => {
    expect(isHumanOnly('L5')).toBe(true);
    expect(isHumanOnly('L4')).toBe(false);
  });
  it('rank は順序を持つ', () => {
    expect(rank('L0')).toBeLessThan(rank('L5'));
  });
});
```

`packages/core/test/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fact, hypothesis, decision, isDecision } from '../src/result.js';

describe('result/knowledge', () => {
  it('種別を保持する', () => {
    expect(fact(42).kind).toBe('fact');
    expect(hypothesis('x').kind).toBe('hypothesis');
  });
  it('basis(根拠)を保持できる', () => {
    expect(fact(1, 'doc#3').basis).toBe('doc#3');
  });
  it('isDecision は decision のみ true', () => {
    expect(isDecision(decision('go'))).toBe(true);
    expect(isDecision(hypothesis('maybe'))).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm --filter @oip/core test`
Expected: FAIL（`src/boundaries.js` / `src/result.js` が存在しない）。

- [ ] **Step 3: 最小実装を書く**

`packages/core/src/boundaries.ts`:

```ts
// docs/06 の実行レベル。L2(社内保存)以上は人間の確認/承認が要る。L5 は人間専用。
export const EXECUTION_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type ExecutionLevel = (typeof EXECUTION_LEVELS)[number];

export function rank(level: ExecutionLevel): number {
  return EXECUTION_LEVELS.indexOf(level);
}

export function requiresHumanApproval(level: ExecutionLevel): boolean {
  return rank(level) >= rank('L2');
}

export function isHumanOnly(level: ExecutionLevel): boolean {
  return level === 'L5';
}
```

`packages/core/src/result.ts`:

```ts
// 非交渉ルール6: 推定/仮説/事実/正式決定 をデータ上で分離する。
export type Provenance = 'fact' | 'hypothesis' | 'estimate' | 'decision';

export interface Knowledge<T> {
  kind: Provenance;
  value: T;
  basis?: string; // 根拠ID/出典 (追跡可能性 ルール7)
}

const make =
  (kind: Provenance) =>
  <T>(value: T, basis?: string): Knowledge<T> => ({ kind, value, basis });

export const fact = make('fact');
export const hypothesis = make('hypothesis');
export const estimate = make('estimate');
export const decision = make('decision');

export function isDecision<T>(k: Knowledge<T>): boolean {
  return k.kind === 'decision';
}
```

`packages/core/src/index.ts`:

```ts
export * from './boundaries.js';
export * from './result.js';
```

- [ ] **Step 4: テストと typecheck を実行して pass を確認**

Run: `pnpm --filter @oip/core test && pnpm --filter @oip/core typecheck`
Expected: テスト PASS、typecheck エラー無し。

- [ ] **Step 5: Commit**

```bash
git add packages/core pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(core): 実行レベルと知識分類の型を追加"
```

---

### Task 3: apps/ingest-func 骨組み ＋ config ＋ health

**Files:**

- Create: `apps/ingest-func/package.json`
- Create: `apps/ingest-func/tsconfig.json`
- Create: `apps/ingest-func/host.json`
- Create: `apps/ingest-func/src/config/env.ts`
- Create: `apps/ingest-func/src/functions/health.ts`
- Test: `apps/ingest-func/test/env.test.ts`
- Test: `apps/ingest-func/test/health.test.ts`

**Interfaces:**

- Produces:
  - `config/env.ts`: `interface AppConfig`; `loadConfig(env?): AppConfig`。
  - `functions/health.ts`: `interface HealthBody { status: 'ok'; version: string; commit: string }`; `buildHealth(cfg?): HealthBody`; `healthHandler(req, ctx): Promise<HttpResponseInit>`。

- [ ] **Step 1: package スキャフォールドとテストを先に書く**

`apps/ingest-func/package.json`:

```json
{
  "name": "@oip/ingest-func",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@azure/monitor-opentelemetry": "^1.8.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/ingest-func/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src"]
}
```

`apps/ingest-func/host.json`:

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

`apps/ingest-func/test/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('既定値を返す', () => {
    const c = loadConfig({});
    expect(c.serviceBusQueueName).toBe('events');
    expect(c.version).toBe('0.0.0');
    expect(c.commit).toBe('unknown');
  });
  it('環境変数を反映する', () => {
    const c = loadConfig({ APP_VERSION: '1.2.3', APP_COMMIT: 'abc', SERVICE_BUS_QUEUE: 'q1' });
    expect(c.version).toBe('1.2.3');
    expect(c.commit).toBe('abc');
    expect(c.serviceBusQueueName).toBe('q1');
  });
});
```

`apps/ingest-func/test/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHealth } from '../src/functions/health.js';

describe('buildHealth', () => {
  it('status ok と version/commit を返す', () => {
    const body = buildHealth({
      serviceBusQueueName: 'events',
      version: '1.0.0',
      commit: 'deadbee',
    });
    expect(body).toEqual({ status: 'ok', version: '1.0.0', commit: 'deadbee' });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm --filter @oip/ingest-func test`
Expected: FAIL（`src/config/env.js` / `src/functions/health.js` が無い）。

- [ ] **Step 3: 最小実装を書く**

`apps/ingest-func/src/config/env.ts`:

```ts
export interface AppConfig {
  appInsightsConnectionString?: string;
  serviceBusNamespace?: string;
  serviceBusQueueName: string;
  version: string;
  commit: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    appInsightsConnectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    serviceBusNamespace: env.SERVICE_BUS_NAMESPACE,
    serviceBusQueueName: env.SERVICE_BUS_QUEUE ?? 'events',
    version: env.APP_VERSION ?? '0.0.0',
    commit: env.APP_COMMIT ?? 'unknown',
  };
}
```

`apps/ingest-func/src/functions/health.ts`:

```ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { loadConfig, type AppConfig } from '../config/env.js';

export interface HealthBody {
  status: 'ok';
  version: string;
  commit: string;
}

// Fast Path: AI を呼ばない決定論処理。
export function buildHealth(cfg: AppConfig = loadConfig()): HealthBody {
  return { status: 'ok', version: cfg.version, commit: cfg.commit };
}

export async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: buildHealth() };
}
```

- [ ] **Step 4: テストと typecheck を実行して pass を確認**

Run: `pnpm --filter @oip/ingest-func test && pnpm --filter @oip/ingest-func typecheck`
Expected: テスト PASS、typecheck エラー無し。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest-func pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(ingest-func): config と health(Fast Path)を追加"
```

---

### Task 4: onEvent（Service Bus トリガ雛形）

**Files:**

- Create: `apps/ingest-func/src/functions/onEvent.ts`
- Test: `apps/ingest-func/test/onEvent.test.ts`

**Interfaces:**

- Consumes: なし（純粋関数）。
- Produces: `interface EventEnvelope { id: string; type: string; occurredAt: string }`; `type ParseResult = { ok: true; value: EventEnvelope } | { ok: false; error: string }`; `parseEvent(message: unknown): ParseResult`; `onEventHandler(message: unknown, ctx: InvocationContext): Promise<void>`。

- [ ] **Step 1: テストを先に書く**

`apps/ingest-func/test/onEvent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/functions/onEvent.js';

describe('parseEvent', () => {
  it('正常なイベントを解析する', () => {
    const r = parseEvent({ id: 'e1', type: 'meeting.ended', occurredAt: '2026-07-11T00:00:00Z' });
    expect(r).toEqual({
      ok: true,
      value: { id: 'e1', type: 'meeting.ended', occurredAt: '2026-07-11T00:00:00Z' },
    });
  });
  it('occurredAt 欠落は空文字で許容', () => {
    const r = parseEvent({ id: 'e1', type: 't' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.occurredAt).toBe('');
  });
  it('id 欠落は拒否（未信頼入力を通さない）', () => {
    expect(parseEvent({ type: 't' })).toEqual({ ok: false, error: 'id required' });
  });
  it('オブジェクト以外は拒否', () => {
    expect(parseEvent('nope').ok).toBe(false);
    expect(parseEvent(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm --filter @oip/ingest-func test onEvent`
Expected: FAIL（`onEvent.js` が無い）。

- [ ] **Step 3: 最小実装を書く**

`apps/ingest-func/src/functions/onEvent.ts`:

```ts
import type { InvocationContext } from '@azure/functions';

export interface EventEnvelope {
  id: string;
  type: string;
  occurredAt: string;
}

export type ParseResult =
  | { ok: true; value: EventEnvelope }
  | { ok: false; error: string };

// 非交渉ルール3: 未信頼入力を検証し、命令として実行しない。
export function parseEvent(message: unknown): ParseResult {
  if (typeof message !== 'object' || message === null) {
    return { ok: false, error: 'message must be an object' };
  }
  const m = message as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length === 0) {
    return { ok: false, error: 'id required' };
  }
  if (typeof m.type !== 'string' || m.type.length === 0) {
    return { ok: false, error: 'type required' };
  }
  const occurredAt = typeof m.occurredAt === 'string' ? m.occurredAt : '';
  return { ok: true, value: { id: m.id, type: m.type, occurredAt } };
}

export async function onEventHandler(
  message: unknown,
  ctx: InvocationContext,
): Promise<void> {
  const parsed = parseEvent(message);
  if (!parsed.ok) {
    ctx.error(`invalid event dropped: ${parsed.error}`);
    return; // 検証失敗はログのみで打ち切る
  }
  ctx.log(`event received: ${parsed.value.type} (${parsed.value.id})`);
  // 業務ロジック(合意/未決/タスク抽出)は B フェーズ (PoC #25)
}
```

- [ ] **Step 4: テストと typecheck を実行して pass を確認**

Run: `pnpm --filter @oip/ingest-func test && pnpm --filter @oip/ingest-func typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest-func/src/functions/onEvent.ts apps/ingest-func/test/onEvent.test.ts
git -c commit.gpgsign=false commit -m "feat(ingest-func): onEvent(Service Busトリガ)雛形を追加"
```

---

### Task 5: telemetry ＋ 関数登録(index)

**Files:**

- Create: `apps/ingest-func/src/observability/telemetry.ts`
- Create: `apps/ingest-func/src/index.ts`
- Test: `apps/ingest-func/test/telemetry.test.ts`

**Interfaces:**

- Consumes: `loadConfig`（Task 3）、`healthHandler`（Task 3）、`onEventHandler`（Task 4）。
- Produces: `shouldStart(cfg): boolean`; `startTelemetry(cfg?): void`。`src/index.ts` が `app.http`/`app.serviceBusQueue` で登録するエントリ。

- [ ] **Step 1: テストを先に書く**

`apps/ingest-func/test/telemetry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldStart } from '../src/observability/telemetry.js';

describe('shouldStart', () => {
  it('接続文字列が無ければ起動しない', () => {
    expect(shouldStart({ serviceBusQueueName: 'events', version: '0', commit: 'x' })).toBe(false);
  });
  it('接続文字列があれば起動する', () => {
    expect(
      shouldStart({
        serviceBusQueueName: 'events',
        version: '0',
        commit: 'x',
        appInsightsConnectionString: 'InstrumentationKey=abc',
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm --filter @oip/ingest-func test telemetry`
Expected: FAIL（`telemetry.js` が無い）。

- [ ] **Step 3: 実装を書く**

`apps/ingest-func/src/observability/telemetry.ts`:

```ts
import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { loadConfig, type AppConfig } from '../config/env.js';

let started = false;

export function shouldStart(cfg: AppConfig): boolean {
  return typeof cfg.appInsightsConnectionString === 'string'
    && cfg.appInsightsConnectionString.length > 0;
}

// App Insights 接続文字列がある時のみ OTel を初期化（冪等）。
export function startTelemetry(cfg: AppConfig = loadConfig()): void {
  if (started || !shouldStart(cfg)) return;
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString: cfg.appInsightsConnectionString },
  });
  started = true;
}
```

`apps/ingest-func/src/index.ts`:

```ts
import { app } from '@azure/functions';
import { loadConfig } from './config/env.js';
import { healthHandler } from './functions/health.js';
import { onEventHandler } from './functions/onEvent.js';
import { startTelemetry } from './observability/telemetry.js';

const cfg = loadConfig();
startTelemetry(cfg);

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});

app.serviceBusQueue('onEvent', {
  queueName: cfg.serviceBusQueueName,
  connection: 'ServiceBusConnection',
  handler: onEventHandler,
});
```

- [ ] **Step 4: テスト・typecheck・build を確認**

Run: `pnpm --filter @oip/ingest-func test && pnpm --filter @oip/ingest-func typecheck && pnpm --filter @oip/ingest-func build`
Expected: すべて成功（`dist/` が生成される）。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest-func/src/observability apps/ingest-func/src/index.ts apps/ingest-func/test/telemetry.test.ts pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(ingest-func): OTel初期化と関数登録を追加"
```

---

### Task 6: ローカルゲートに typecheck/test を組込み

**Files:**

- Modify: `Makefile`
- Modify: `.pre-commit-config.yaml`

**Interfaces:**

- Consumes: ルート scripts `typecheck`/`test`（Task 1）。
- Produces: `make typecheck` / `make test`; pre-push フックで `pnpm -r typecheck` と `pnpm -r test` が発火。

- [ ] **Step 1: Makefile にターゲット追加**

`Makefile` の `.PHONY` 行に `typecheck test` を追加し、末尾に:

```make
typecheck:
 pnpm -r typecheck

test:
 pnpm -r test
```

- [ ] **Step 2: pre-commit の pre-push に local hook 追加**

`.pre-commit-config.yaml` の `repo: local` の `hooks:` 配下（`security-scan` の前）に追加:

```yaml
      - id: typecheck
        name: pnpm typecheck
        entry: pnpm -r typecheck
        language: system
        pass_filenames: false
        stages: [pre-push]
      - id: unit-test
        name: pnpm test (vitest)
        entry: pnpm -r test
        language: system
        pass_filenames: false
        stages: [pre-push]
```

- [ ] **Step 3: 検証**

Run: `pre-commit validate-config .pre-commit-config.yaml && make typecheck && make test`
Expected: `CONFIG VALID` 表示、typecheck/test ともに成功。
補足: pre-push フックは非対話 git 環境で `node`/`pnpm` を PATH で解決できる必要がある（corepack で pnpm、nvm の node を PATH に）。解決できない場合は `~/.zshenv` などで PATH を通す。

- [ ] **Step 4: Commit**

```bash
git add Makefile .pre-commit-config.yaml
git -c commit.gpgsign=false commit -m "chore: ローカルゲートに typecheck/test を追加"
```

---

### Task 7: IaC（Flex Consumption）＋ azd 配線

**Files:**

- Create: `infra/modules/functions.bicep`
- Modify: `infra/main.bicep`
- Modify: `azure.yaml`
- （`infra/main.parameters.json` は既存の environmentName/location/tags で足りるため変更不要）

**Interfaces:**

- Consumes: `main.bicep` の `environmentName` / `location`。
- Produces: RG 内に Function App(Flex) 一式。`azure.yaml` の `services.ingest-func`。

- [ ] **Step 1: functions モジュールを作成**

`infra/modules/functions.bicep`:

```bicep
@description('環境名 (dev/stg/prod)')
param environmentName string
@description('リージョン')
param location string
@description('共通タグ')
param tags object = {}

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('stoip${environmentName}${suffix}')
var planName = 'plan-oip-${environmentName}'
var appName = 'func-oip-${environmentName}-${suffix}'
var sbName = 'sb-oip-${environmentName}-${suffix}'
var queueName = 'events'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { minimumTlsVersion: 'TLS1_2', allowBlobPublicAccess: false }
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/deploymentpackage'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-oip-${environmentName}'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-oip-${environmentName}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  kind: 'functionapp'
  properties: { reserved: true }
}

resource sb 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: sbName
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
}

resource sbQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: sb
  name: queueName
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  tags: union(tags, { 'azd-service-name': 'ingest-func' })
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}deploymentpackage'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
      runtime: { name: 'node', version: '20' }
    }
    siteConfig: {
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'SERVICE_BUS_NAMESPACE', value: '${sb.name}.servicebus.windows.net' }
        { name: 'SERVICE_BUS_QUEUE', value: queueName }
        { name: 'ServiceBusConnection__fullyQualifiedNamespace', value: '${sb.name}.servicebus.windows.net' }
      ]
    }
  }
}

// RBAC: Function の Managed Identity にデプロイ storage と Service Bus 受信権限。
var blobOwnerRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var sbReceiverRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, site.id, blobOwnerRole)
  scope: storage
  properties: { principalId: site.identity.principalId, roleDefinitionId: blobOwnerRole, principalType: 'ServicePrincipal' }
}

resource sbRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sb.id, site.id, sbReceiverRole)
  scope: sb
  properties: { principalId: site.identity.principalId, roleDefinitionId: sbReceiverRole, principalType: 'ServicePrincipal' }
}

output functionAppName string = site.name
output serviceBusNamespace string = sb.name
```

- [ ] **Step 2: main.bicep からモジュールを呼ぶ**

`infra/main.bicep` の `output` 行の前にモジュール呼び出しを追加:

```bicep
module functions 'modules/functions.bicep' = {
  name: 'functions'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    tags: commonTags
  }
}
```

末尾 output に追加:

```bicep
output functionAppName string = functions.outputs.functionAppName
```

- [ ] **Step 3: bicep build で検証**

Run: `bicep build infra/main.bicep --stdout > /dev/null && echo OK`
Expected: `OK`（警告があれば内容を確認し、スキーマ/API バージョン起因ならメッセージに従い修正）。

- [ ] **Step 4: azure.yaml に service を追加**

`azure.yaml` の末尾に追加:

```yaml
services:
  ingest-func:
    project: apps/ingest-func
    language: ts
    host: function
```

- [ ] **Step 5: 検証（gate 一式）**

Run: `make validate && make bicep`
Expected: ともに成功（`make validate` は pre-commit + bicep build を含む）。

- [ ] **Step 6: Commit**

```bash
git add infra azure.yaml
git -c commit.gpgsign=false commit -m "feat(infra): Flex Consumption Function App の Bicep と azd 配線を追加"
```

---

## 完了後の全体検証（DoD）

Run:

```bash
export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"
pnpm install
pnpm -r typecheck && pnpm -r test && pnpm -r build
bicep build infra/main.bicep --stdout > /dev/null && echo "bicep OK"
make validate && make security
```

Expected: 全て成功。azd 実デプロイ（`azd up`）は Azure 認証＋コスト承認が前提のため本計画のスコープ外。

## 備考

- `@azure/functions` v4 / `@azure/monitor-opentelemetry` / Flex Consumption の Bicep スキーマはバージョンに敏感。各 Step の `bicep build` と `typecheck` が検証ゲートになる。失敗時はエラーメッセージに従い API バージョン/プロパティを調整する。
- `apps/ingest-func` は本フェーズで `@oip/core` を import しない。B フェーズ（PoC #25）で境界型・知識分類型を実際の抽出ロジックに接続する。
