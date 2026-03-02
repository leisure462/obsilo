# Feature-Spezifikation: Sandbox OS-Level Process Isolation

**Datum**: 2026-03-02
**Revision**: 1
**Status**: Spezifiziert, Implementierung ausstehend
**Abhaengigkeit**: Bestehende Sandbox-Infrastruktur (FEATURE-self-development.md Phase 3)
**ADR**: ADR-021-sandbox-os-isolation.md
**Bezug**: AUDIT-obsilo-2026-03-01.md, Finding H-1 (CWE-693)

---

## 1. Ueberblick

### Problem

Die aktuelle iframe-Sandbox (`sandbox="allow-scripts"`) bietet in Electrons Renderer nur V8-Origin-Isolation -- eine logische Grenze im gleichen Prozess mit shared address space. Bei `nodeIntegration: true` koennte ein V8-Exploit theoretisch aus der iframe-Sandbox ausbrechen und vollen Node.js-Zugriff erlangen (Spectre/Meltdown, V8 Use-After-Free).

### Loesung

Migration der Code-Ausfuehrung von iframe-basiert zu `child_process.fork()`-basiert auf Desktop. Der Kindprozess laeuft als eigenstaendiger OS-Prozess mit `ELECTRON_RUN_AS_NODE=1` -- eigener V8-Heap, eigener Event-Loop, kein Zugriff auf Electron oder Obsidian APIs. Kommunikation ausschliesslich ueber Node.js IPC.

### Hybrid-Architektur

```
                    ISandboxExecutor (Interface)
                   /                            \
    ProcessSandboxExecutor               IframeSandboxExecutor
    (Desktop: child_process.fork)        (Mobile: iframe sandbox)
           |                                    |
    sandbox-worker.js                    sandboxHtml.ts
    (eigener OS-Prozess)                (iframe srcdoc)
           |                                    |
    Node.js IPC                          postMessage
           \                                   /
            +--- SandboxBridge (identisch) ---+
                    |           |
             Vault Access   URL Allowlist
             Rate Limits    Circuit Breaker
```

Mobile (iOS/Android) hat kein `child_process` -- dort bleibt die iframe-Sandbox als Fallback.

---

## 2. Security-Architektur

### 2.1 Vergleich der Isolations-Ebenen

| Eigenschaft | iframe sandbox (Mobile) | child_process.fork (Desktop) |
|---|---|---|
| **Isolation** | V8 Origin (logisch, same-process) | **OS-Level Prozess** |
| **Speicher** | Shared address space | **Separate Heaps** |
| **Spectre/Meltdown** | Verwundbar | **Geschuetzt (eigener Prozess)** |
| **V8-Exploit** | Durchbricht Sandbox -> Node.js | **Crash im eigenen Prozess** |
| **Crash-Isolation** | Kann Parent beeinflussen | **Komplett isoliert** |
| **CPU-Isolation** | Teilt Event Loop | **Eigener Event Loop** |
| **IPC** | postMessage (Chromium) | process.send/on (Node.js) |

### 2.2 Defense-in-Depth (6 Schichten)

| Schicht | Mechanismus | Primaer/Sekundaer |
|---------|------------|-------------------|
| 1. OS-Prozess-Grenze | `child_process.fork()` mit `ELECTRON_RUN_AS_NODE=1` | **Primaer** |
| 2. Code-Scope-Einschraenkung | `new Function('exports', 'vault', 'requestUrl', code)` | Sekundaer |
| 3. AstValidator | Blockiert `process`, `require`, `child_process`, `globalThis` im Source | Sekundaer |
| 4. SandboxBridge | Pfad-Validierung, URL-Allowlist, Rate-Limiting, Circuit Breaker | Sekundaer |
| 5. User Approval | evaluate_expression erfordert explizite Freigabe | UX |
| 6. Audit Trail | OperationLogger zeichnet alle Ausfuehrungen auf | Monitoring |

### 2.3 Warum `new Function()` statt `vm.runInNewContext()`

Im Worker-Prozess wird Code via `new Function()` ausgefuehrt (identisch zum iframe-Ansatz):

- `vm.runInNewContext()` hat Promise-Realm-Probleme: async/await funktioniert nicht sauber cross-realm (verschiedene Promise-Konstruktoren)
- Die OS-Prozess-Grenze ist die primaere Sicherheitsbarriere
- AstValidator blockt gefaehrliche Patterns bereits vor Compilation
- `new Function()` ist getestet und bewaehrt im iframe-Kontext

### 2.4 Zukunft: Node.js Permission Model

Sobald Obsidian auf Electron 41+ (Node.js 23+) wechselt, kann der Kindprozess zusaetzlich mit `--permission` Flags gestartet werden:

```typescript
spawn(process.execPath, [
    '--permission',
    '--allow-fs-read=' + vaultPath,
    'sandbox-worker.js'
], { env: { ELECTRON_RUN_AS_NODE: '1' } });
```

Aktuelle Obsidian-Versionen liefern Node.js 20.18-22.20 -- Permission Model erst ab 23.5 stabil.

---

## 3. Architektur

### 3.1 ISandboxExecutor Interface

```typescript
export interface ISandboxExecutor {
    ensureReady(): Promise<void>;
    execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown>;
    destroy(): void;
}
```

Beide Backends implementieren dieses Interface. Konsumenten (EvaluateExpressionTool, DynamicToolFactory, etc.) arbeiten nur gegen das Interface.

### 3.2 ProcessSandboxExecutor (Desktop)

- **Spawn:** `child_process.fork()` mit `ELECTRON_RUN_AS_NODE=1`, `stdio: ['pipe','pipe','pipe','ipc']`
- **Worker-Pfad:** `path.join(__dirname, 'sandbox-worker.js')` -- `__dirname` zeigt auf `.obsidian/plugins/obsilo-agent/`
- **Lazy Init:** Worker wird erst beim ersten Aufruf gestartet (~300-3000ms auf macOS), dann dauerhaft am Leben gehalten
- **IPC-Protokoll:** Identische Message-Typen wie iframe-Sandbox (execute, result, error, vault-read, vault-write, request-url)
- **Timeout:** 30s pro Execution, 15s pro Bridge-Call
- **Crash-Recovery:** Bei Worker-Exit werden alle Pending rejected, Respawn beim naechsten Aufruf (max 3x)
- **Destroy:** SIGTERM + 2s SIGKILL-Fallback bei Plugin-Unload

### 3.3 IframeSandboxExecutor (Mobile-Fallback)

Identisch zur bisherigen `SandboxExecutor`-Implementierung. Nur umbenannt und mit `implements ISandboxExecutor`.

### 3.4 Factory

```typescript
import { Platform } from 'obsidian';

export function createSandboxExecutor(plugin: ObsidianAgentPlugin): ISandboxExecutor {
    if (Platform.isDesktop) return new ProcessSandboxExecutor(plugin);
    return new IframeSandboxExecutor(plugin);
}
```

### 3.5 sandbox-worker.ts

Kompiliert als separater esbuild Entry Point zu `sandbox-worker.js`. Deployed neben `main.js`.

```
Obsidian Renderer (Plugin)
    |
    | child_process.fork() + IPC
    | env: { ELECTRON_RUN_AS_NODE: '1' }
    |
    v
sandbox-worker.js (eigener OS-Prozess)
    - Frozen bridge proxies (vault, requestUrl)
    - new Function() fuer Code-Execution
    - process.send() / process.on('message') fuer IPC
    - Kein Electron, kein DOM, kein Obsidian API
```

### 3.6 Build-Konfiguration

Zweiter esbuild-Context in `esbuild.config.mjs`:

```javascript
const workerContext = await esbuild.context({
    entryPoints: ["src/core/sandbox/sandbox-worker.ts"],
    bundle: true,
    external: [...builtins],
    format: "cjs",
    platform: "node",
    outfile: "sandbox-worker.js",
});
```

vault-deploy Plugin kopiert `sandbox-worker.js` neben `main.js`.

---

## 4. IPC-Protokoll

### 4.1 Parent -> Worker

```typescript
| { type: 'execute'; id: string; code: string; input: Record<string, unknown> }
| { callId: string; result: unknown }     // Bridge-Response
| { callId: string; error: string }       // Bridge-Error
```

### 4.2 Worker -> Parent

```typescript
| { type: 'sandbox-ready' }
| { type: 'result'; id: string; value: unknown }
| { type: 'error'; id: string; message: string }
| { type: 'vault-read'; callId: string; path: string }
| { type: 'vault-read-binary'; callId: string; path: string }
| { type: 'vault-list'; callId: string; path: string }
| { type: 'vault-write'; callId: string; path: string; content: string }
| { type: 'vault-write-binary'; callId: string; path: string; content: ArrayBuffer }
| { type: 'request-url'; callId: string; url: string; options?: { method?: string; body?: string } }
```

Identisch zum bestehenden postMessage-Protokoll in `SandboxExecutor.ts` / `sandboxHtml.ts`.

---

## 5. Abgrenzung

### Was aendert sich

- Neue Dateien: ISandboxExecutor, ProcessSandboxExecutor, sandbox-worker.ts, createSandboxExecutor
- Rename: SandboxExecutor -> IframeSandboxExecutor
- Import-Migration: 9 Consumer-Dateien (nur Typ-Aenderung)
- Build: Zweiter esbuild Entry Point + Deploy

### Was aendert sich NICHT

- SandboxBridge (identisch fuer beide Backends)
- sandboxHtml.ts (weiterhin fuer Mobile-Fallback)
- AstValidator (Validierung vor Compilation, backend-unabhaengig)
- EsbuildWasmManager (Compilation ist unabhaengig vom Execution-Backend)
- EvaluateExpressionTool (Interface bleibt gleich)
- Alle anderen 28+ Tools, UI, Provider, AgentTask

---

## 6. Key Files

| Datei | Rolle |
|-------|-------|
| `src/core/sandbox/ISandboxExecutor.ts` | Gemeinsames Interface |
| `src/core/sandbox/ProcessSandboxExecutor.ts` | Desktop-Backend (child_process.fork) |
| `src/core/sandbox/sandbox-worker.ts` | Worker-Script (eigener OS-Prozess) |
| `src/core/sandbox/createSandboxExecutor.ts` | Platform-basierte Factory |
| `src/core/sandbox/IframeSandboxExecutor.ts` | Mobile-Fallback (ex SandboxExecutor) |
| `src/core/sandbox/SandboxBridge.ts` | Security-Gatekeeper (unveraendert) |
| `esbuild.config.mjs` | Zweiter Build-Context |

---

## 7. Akzeptanzkriterien

- [ ] Desktop: evaluate_expression laeuft in separatem OS-Prozess (verifizierbar via PID)
- [ ] Desktop: Vault-Bridge-Operationen (read, write, list) funktionieren ueber IPC
- [ ] Desktop: requestUrl-Bridge funktioniert ueber IPC (Allowlist)
- [ ] Desktop: Dependencies (npm-Pakete) werden korrekt gebundelt und ausgefuehrt
- [ ] Desktop: Timeout nach 30s bei haengender Execution
- [ ] Desktop: Worker-Crash fuehrt zu Respawn beim naechsten Aufruf
- [ ] Desktop: Plugin-Unload beendet Worker-Prozess sauber (kein Zombie)
- [ ] Mobile: Automatischer Fallback auf iframe-Sandbox
- [ ] Build: main.js + sandbox-worker.js werden erzeugt und deployed
- [ ] Review-Bot: Kein console.log, kein fetch, kein innerHTML, kein any
- [ ] Regression: DynamicToolFactory, CodeModuleCompiler, SelfAuthoredSkillLoader funktionieren

---

## 8. Bekannte Limitierungen

1. **Mobile:** Kein child_process auf iOS/Android. iframe-Sandbox als Fallback.
2. **First-Spawn-Latenz:** ~300-3000ms auf macOS bei signierten Apps. Mitigiert durch Keep-Alive.
3. **Worker hat Node.js:** Der Kindprozess hat vollen Node.js-Zugriff. AstValidator + new Function() als Defense-in-Depth.
4. **Permission Model:** Node.js `--permission` Flags erst ab Node 23.5. Obsidian liefert aktuell Node 20-22.
5. **Separater Build-Output:** sandbox-worker.js muss neben main.js deployed werden. Erhoet Deployment-Komplexitaet.
