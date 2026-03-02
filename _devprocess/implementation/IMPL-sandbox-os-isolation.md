# Implementierungsplan: Sandbox OS-Level Process Isolation

**Datum:** 2026-03-02
**Branch:** `sandbox-os-isolation`
**ADR:** ADR-021-sandbox-os-isolation.md
**Feature:** FEATURE-sandbox-os-isolation.md
**Bezug:** AUDIT-obsilo-2026-03-01.md, Finding H-1

---

## 1. Kontext

Finding H-1: iframe-Sandbox bietet in Electron nur V8-Origin-Isolation (same-process, shared address space). Migration zu `child_process.fork()` mit `ELECTRON_RUN_AS_NODE=1` fuer echte OS-Level Prozess-Isolation auf Desktop. Mobile-Fallback ueber bestehende iframe-Sandbox.

**Root Cause:** Obsidians Renderer laeuft mit `nodeIntegration: true`. Ein V8-Exploit koennte aus der iframe-Sandbox ausbrechen und Node.js-Zugriff erlangen.

---

## 2. Implementierungs-Schritte

### Schritt 1: Interface extrahieren

**Datei NEU: `src/core/sandbox/ISandboxExecutor.ts`**

```typescript
// NACHHER
export interface ISandboxExecutor {
    ensureReady(): Promise<void>;
    execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown>;
    destroy(): void;
}
```

**Datei RENAME: `SandboxExecutor.ts` -> `IframeSandboxExecutor.ts`**

```typescript
// VORHER
export class SandboxExecutor {

// NACHHER
import type { ISandboxExecutor } from './ISandboxExecutor';
export class IframeSandboxExecutor implements ISandboxExecutor {
```

Logik bleibt identisch. Nur Name + Interface-Klausel.

**Verifikation:** `npm run build` erfolgreich.

---

### Schritt 2: Import-Migration (9 Dateien)

Alle Consumer aendern `SandboxExecutor` (Typ) -> `ISandboxExecutor`:

| Datei | Zeilen | Aenderung |
|-------|--------|-----------|
| `src/main.ts` | L44, L100, L216 | Import-Pfad + Property-Typ `ISandboxExecutor` |
| `src/core/tools/ToolRegistry.ts` | L74, L92, L117 | Import + Parameter-Typ |
| `src/core/tools/agent/EvaluateExpressionTool.ts` | L14, L38 | Import + Parameter-Typ |
| `src/core/tools/agent/ManageSkillTool.ts` | L22, L59 | Import + Parameter-Typ |
| `src/core/tools/dynamic/DynamicToolFactory.ts` | L13, L27, L65 | Import + Parameter-Typ |
| `src/core/tools/dynamic/DynamicToolLoader.ts` | L20, L43 | Import + Parameter-Typ |
| `src/core/skills/CodeModuleCompiler.ts` | L13, L40 | Import + Parameter-Typ |
| `src/core/skills/SelfAuthoredSkillLoader.ts` | L19, L54, L64, L79 | Import + Parameter-Typ |

Pattern ueberall identisch:
```typescript
// VORHER
import type { SandboxExecutor } from '../sandbox/SandboxExecutor';
// NACHHER
import type { ISandboxExecutor } from '../sandbox/ISandboxExecutor';
```

**Verifikation:** `npm run build` erfolgreich, `evaluate_expression` funktioniert (iframe-Backend).

---

### Schritt 3: esbuild-Konfiguration (Zweiter Entry Point)

**Datei: `esbuild.config.mjs`**

```javascript
// VORHER: Ein Context
const context = await esbuild.context({ ... });

// NACHHER: Zwei Contexts
const mainContext = await esbuild.context({
    // ... (identisch wie bisher, nur Variable umbenannt)
});

const workerContext = await esbuild.context({
    entryPoints: ["src/core/sandbox/sandbox-worker.ts"],
    bundle: true,
    external: [...builtins],
    format: "cjs",
    target: "es2022",
    platform: "node",
    outfile: "sandbox-worker.js",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    plugins: [{
        name: "node-builtins",
        setup(build) {
            build.onResolve({ filter: /^node:/ }, (args) => ({
                path: args.path, external: true,
            }));
        }
    }],
});
```

vault-deploy Plugin erweitern:
```javascript
// NACHHER (im vault-deploy Plugin, nach main.js copy):
if (existsSync("sandbox-worker.js")) {
    copyFileSync("sandbox-worker.js", `${VAULT_PLUGIN_DIR}/sandbox-worker.js`);
}
```

Watch/Build-Mode:
```javascript
// VORHER
if (prod) { await context.rebuild(); process.exit(0); }
else { await context.watch(); }

// NACHHER
if (prod) {
    await mainContext.rebuild();
    await workerContext.rebuild();
    process.exit(0);
} else {
    await mainContext.watch();
    await workerContext.watch();
}
```

**Datei NEU: `src/core/sandbox/sandbox-worker.ts` (Stub)**

```typescript
// Minimaler Stub fuer Build-Verifikation
process.send!({ type: 'sandbox-ready' });
```

**Verifikation:** Build erzeugt `main.js` UND `sandbox-worker.js`. Beide im Deploy-Verzeichnis.

---

### Schritt 4: sandbox-worker.ts (vollstaendig)

**Datei: `src/core/sandbox/sandbox-worker.ts` (~120 Zeilen)**

Kernkomponenten:
1. Bridge-Proxy (frozen): `vault.read/write/list`, `requestUrl`
2. `bridgeCall(type, payload)` mit callId + 15s Timeout via `process.send()`
3. Message-Handler: Bridge-Responses + Execute-Commands
4. `executeInSandbox(id, code, input)`: `new Function('exports', 'vault', 'requestUrl', code)` -> `exports.execute(input, ctx)`
5. Ready-Signal: `process.send({type:'sandbox-ready'})`

```typescript
// NACHHER (Kernstruktur)
const vault = Object.freeze({
    read: (path: string) => bridgeCall('vault-read', { path }),
    readBinary: (path: string) => bridgeCall('vault-read-binary', { path }),
    list: (path: string) => bridgeCall('vault-list', { path }),
    write: (path: string, content: string) => bridgeCall('vault-write', { path, content }),
    writeBinary: (path: string, content: ArrayBuffer) => bridgeCall('vault-write-binary', { path, content }),
});

const requestUrlProxy = Object.freeze(
    (url: string, options?: { method?: string; body?: string }) =>
        bridgeCall('request-url', { url, options })
);

process.on('message', (msg) => {
    // Bridge-Response -> resolve pending call
    // Execute-Command -> executeInSandbox()
});

async function executeInSandbox(id: string, code: string, input: Record<string, unknown>): Promise<void> {
    const moduleExports: Record<string, unknown> = {};
    const fn = new Function('exports', 'vault', 'requestUrl', code);
    fn(moduleExports, vault, requestUrlProxy);
    const result = await (moduleExports.execute as Function)(input, { vault, requestUrl: requestUrlProxy });
    process.send!({ type: 'result', id, value: result });
}

process.send!({ type: 'sandbox-ready' });
```

**Verifikation:** Build erfolgreich.

---

### Schritt 5: ProcessSandboxExecutor

**Datei NEU: `src/core/sandbox/ProcessSandboxExecutor.ts` (~180 Zeilen)**

Kernkomponenten:
1. `implements ISandboxExecutor`
2. `ensureReady()`: Lazy `fork()` mit `ELECTRON_RUN_AS_NODE=1`, wartet auf `sandbox-ready`
3. `execute(compiledJs, input)`: IPC-send + Promise mit 30s Timeout
4. Bridge-Routing: vault-read/write/request-url vom Worker -> SandboxBridge -> Response zurueck
5. Crash-Recovery: Worker-Exit -> alle Pending rejected, Respawn beim naechsten execute() (max 3x)
6. `destroy()`: SIGTERM + 2s SIGKILL-Fallback

```typescript
// NACHHER (Kernstruktur)
export class ProcessSandboxExecutor implements ISandboxExecutor {
    private worker: ChildProcess | null = null;
    private bridge: SandboxBridge;
    private pending = new Map<string, PendingExecution>();
    private respawnCount = 0;
    private static readonly MAX_RESPAWNS = 3;

    constructor(private plugin: ObsidianAgentPlugin) {
        this.bridge = new SandboxBridge(plugin);
    }

    async ensureReady(): Promise<void> { /* fork + wait sandbox-ready */ }
    async execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown> { /* IPC */ }
    destroy(): void { /* SIGTERM + SIGKILL fallback */ }

    private async handleMessage(msg: WorkerToParentMessage): Promise<void> {
        // result/error -> resolve/reject pending
        // vault-read/write/request-url -> SandboxBridge -> response
    }
}
```

**Verifikation:** Build erfolgreich.

---

### Schritt 6: Factory + main.ts Integration

**Datei NEU: `src/core/sandbox/createSandboxExecutor.ts` (~20 Zeilen)**

```typescript
// NACHHER
import { Platform } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ISandboxExecutor } from './ISandboxExecutor';

export function createSandboxExecutor(plugin: ObsidianAgentPlugin): ISandboxExecutor {
    if (Platform.isDesktop) {
        const { ProcessSandboxExecutor } = require('./ProcessSandboxExecutor');
        console.debug('[Sandbox] Using ProcessSandboxExecutor (OS-level isolation)');
        return new ProcessSandboxExecutor(plugin);
    }
    const { IframeSandboxExecutor } = require('./IframeSandboxExecutor');
    console.debug('[Sandbox] Using IframeSandboxExecutor (V8 origin isolation)');
    return new IframeSandboxExecutor(plugin);
}
```

**Datei: `src/main.ts`**

```typescript
// VORHER
import { SandboxExecutor } from './core/sandbox/SandboxExecutor';
sandboxExecutor: SandboxExecutor | null = null;
this.sandboxExecutor = new SandboxExecutor(this);

// NACHHER
import type { ISandboxExecutor } from './core/sandbox/ISandboxExecutor';
import { createSandboxExecutor } from './core/sandbox/createSandboxExecutor';
sandboxExecutor: ISandboxExecutor | null = null;
this.sandboxExecutor = createSandboxExecutor(this);
```

**Verifikation:** Build + Deploy. Vollstaendiger Integrationstest:
- `evaluate_expression` mit einfachem Ausdruck
- `evaluate_expression` mit Vault-Bridge
- `evaluate_expression` mit Dependencies
- Timeout-Verhalten
- Plugin-Unload (kein Zombie-Prozess)

---

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `src/core/sandbox/ISandboxExecutor.ts` | **NEU** -- Interface | Gering |
| `src/core/sandbox/IframeSandboxExecutor.ts` | **RENAME** + implements | Mittel |
| `src/core/sandbox/ProcessSandboxExecutor.ts` | **NEU** -- fork()-Backend (~180 LOC) | Hoch |
| `src/core/sandbox/sandbox-worker.ts` | **NEU** -- Worker-Script (~120 LOC) | Hoch |
| `src/core/sandbox/createSandboxExecutor.ts` | **NEU** -- Factory (~20 LOC) | Gering |
| `src/main.ts` | Import + Factory | Gering |
| `src/core/tools/ToolRegistry.ts` | Import-Typ | Gering |
| `src/core/tools/agent/EvaluateExpressionTool.ts` | Import-Typ | Gering |
| `src/core/tools/agent/ManageSkillTool.ts` | Import-Typ | Gering |
| `src/core/tools/dynamic/DynamicToolFactory.ts` | Import-Typ | Gering |
| `src/core/tools/dynamic/DynamicToolLoader.ts` | Import-Typ | Gering |
| `src/core/skills/CodeModuleCompiler.ts` | Import-Typ | Gering |
| `src/core/skills/SelfAuthoredSkillLoader.ts` | Import-Typ | Gering |
| `esbuild.config.mjs` | Zweiter Context + Deploy | Mittel |

---

## 4. Nicht betroffen (Blast Radius)

- `SandboxBridge.ts` -- Unveraendert, von beiden Backends identisch genutzt
- `sandboxHtml.ts` -- Unveraendert, weiterhin fuer IframeSandboxExecutor (Mobile)
- `AstValidator.ts` -- Unveraendert
- `EsbuildWasmManager.ts` -- Unveraendert
- Alle anderen 28+ Tools, UI, Provider, AgentTask, Pipeline
- `styles.css` -- `.agent-sandbox-iframe` bleibt fuer Mobile-Fallback

---

## 5. Verifikation

### V1: Build (nach jedem Schritt)
- [ ] `npm run build` ohne Fehler
- [ ] `main.js` + `sandbox-worker.js` erzeugt (ab Schritt 3)
- [ ] Beide Dateien im Deploy-Verzeichnis

### V2: Desktop -- ProcessSandboxExecutor
- [ ] Einfacher Ausdruck: `return 1 + 1` -> `2`
- [ ] Context: `return context.a + context.b`
- [ ] Vault-Bridge: `await ctx.vault.read('test.md')` liest Datei
- [ ] requestUrl-Bridge: HTTP-Request ueber Allowlist
- [ ] Dependencies: npm-Paket bundeln + ausfuehren
- [ ] Timeout: 35s-Code wird nach 30s abgebrochen
- [ ] AstValidator: `process.exit(1)` wird rejected
- [ ] Crash-Recovery: Worker-Neustart nach Crash

### V3: Mobile-Fallback
- [ ] IframeSandboxExecutor wird auf Mobile gewaehlt
- [ ] evaluate_expression funktioniert wie bisher

### V4: Lifecycle
- [ ] Plugin-Unload beendet Child-Process (kein Zombie)
- [ ] Plugin-Reload startet neuen Worker on-demand

### V5: Regression
- [ ] DynamicToolFactory funktioniert
- [ ] CodeModuleCompiler Dry-Run funktioniert
- [ ] SelfAuthoredSkillLoader registriert Code-Module
- [ ] ManageSkillTool erstellt Skills mit Code-Modulen

### V6: Review-Bot-Compliance
- [ ] Kein console.log/info
- [ ] Kein fetch
- [ ] Kein innerHTML
- [ ] Kein any-Typ
- [ ] Keine floating Promises
