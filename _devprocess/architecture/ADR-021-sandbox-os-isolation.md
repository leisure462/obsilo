# ADR-021: OS-Level Sandbox via child_process.fork()

**Status:** Akzeptiert
**Datum:** 2026-03-02
**Entscheider:** Sebastian Hanke

---

## Kontext

Finding H-1 des Security Audits (AUDIT-obsilo-2026-03-01.md) identifiziert eine fundamentale Limitierung der aktuellen Sandbox-Architektur: Die iframe-Sandbox (`sandbox="allow-scripts"`) bietet in Electrons Renderer nur V8-Origin-Isolation -- eine logische Grenze im gleichen Prozess mit shared address space.

Obsidians Renderer laeuft mit `nodeIntegration: true` und `contextIsolation: false`. Ein V8-Exploit (Spectre/Meltdown, Use-After-Free) koennte theoretisch aus der iframe-Sandbox ausbrechen und vollen Node.js-Zugriff erlangen.

Die detaillierte Analyse (ANALYSE-electron-browserwindow-sandbox-2026-03-02.md) hat 7 Optionen evaluiert.

---

## Optionen

### Option 1: BrowserWindow mit sandbox: true

Electron BrowserWindow mit Chromium-OS-Sandbox.

- (+) Echte OS-Level Chromium-Sandbox
- (-) BrowserWindow ist Main-Prozess-API, Plugin laeuft im Renderer
- (-) Erfordert `@electron/remote` (deprecated seit Electron 14)
- (-) Kein Community-Praezedenzfall, hohes Review-Ablehnungsrisiko
- (-) Fragil: `@electron/remote` kann bei jedem Obsidian-Update entfallen

**Verworfen:** 3 harte Blocker (Main-Prozess, IPC, kein Praezedenzfall).

### Option 2: Electron utilityProcess

Electron Utility Process (seit Electron 22) mit OS-Level Isolation.

- (+) OS-Level Isolation, MessagePort-Kommunikation
- (-) Exklusiv Main-Prozess-API, kein Renderer-Zugriff

**Verworfen:** Nicht verfuegbar aus Plugin-Kontext.

### Option 3: `<webview>` Tag

Electron Webview laeuft als Out-of-Process iframe (eigener Renderer-Prozess).

- (+) OS-Level Isolation, Obsidian Surfing nutzt es erfolgreich
- (-) Electron-Team empfiehlt aktiv die Abkehr ("dramatic architectural changes")
- (-) Obsidian hat Webview-Zugriff ab v1.8 eingeschraenkt
- (-) Kein Electron auf Mobile

**Nicht empfohlen:** Abkuendigungs-Risiko.

### Option 4: Web Workers

Thread-Level Isolation innerhalb des gleichen Prozesses.

- (+) Stabil, Review-Bot-kompatibel
- (-) Gleicher Prozess, gleicher Adressraum -- kein Sicherheitsgewinn vs. iframe

**Verworfen:** Kein Sicherheitsgewinn.

### Option 5: Node.js vm Modul

V8-Kontexte via `vm.createContext()` / `vm.runInContext()`.

- (-) Node.js-Dokumentation warnt explizit: "not a security mechanism"
- (-) Triviale Escapes via `this.constructor.constructor("return process")()`
- (-) Waere ein Sicherheits-Downgrade gegenueber iframe-Sandbox

**Verworfen:** Sicherheits-Downgrade.

### Option 6: child_process.fork() (gewaehlt)

Eigenstaendiger Node.js-Kindprozess mit `ELECTRON_RUN_AS_NODE=1`.

- (+) **Echte OS-Level Prozess-Isolation** (eigener Heap, eigener Event-Loop)
- (+) Kein `@electron/remote` noetig -- rein ueber Node.js APIs
- (+) Crash-Isolation (Kind-Crash beeinflusst Plugin nicht)
- (+) Eingebauter IPC-Kanal (process.send/on)
- (+) Community-Praezedenz (obsidian-git, eigenes ExecuteRecipeTool)
- (+) Review-Bot-kompatibel (`child_process` nicht verboten)
- (+) Zukunftssicher (Node.js `--permission` Flags spaeter moeglich)
- (-) ~300-3000ms First-Spawn auf macOS (mitigiert durch Keep-Alive)
- (-) Separater Build-Output (sandbox-worker.js)
- (-) Nicht auf Mobile verfuegbar (Fallback noetig)

---

## Entscheidung

**Option 6: Hybrid mit child_process.fork() (Desktop) + iframe (Mobile)**

- Desktop: `child_process.fork()` mit `ELECTRON_RUN_AS_NODE=1` fuer OS-Level Prozess-Isolation
- Mobile: iframe-Sandbox (`sandbox="allow-scripts"`) als Fallback (kein child_process auf iOS/Android)
- Strategy Pattern: `ISandboxExecutor` Interface, zwei Implementierungen
- Factory: `createSandboxExecutor()` waehlt basierend auf `Platform.isDesktop`
- SandboxBridge bleibt unveraendert (beide Backends)
- Worker-Script als separater esbuild Entry Point (`sandbox-worker.js`)

---

## Konsequenzen

### Positiv

- Echte OS-Level-Isolation auf Desktop (eigener Prozess, eigener Heap)
- Crash-Isolation: Worker-Crash beeinflusst Plugin/Obsidian nicht
- CPU-Isolation: Endlosschleifen blockieren nicht den UI-Thread
- Zukunftssicher: Node.js `--permission` Flags wenn Obsidian auf Node 23+ wechselt
- Kein Breaking Change fuer Konsumenten (gleiches Interface)

### Negativ

- ~300-3000ms First-Spawn auf macOS bei signierten Apps (mitigiert durch Keep-Alive)
- Separater Build-Output (`sandbox-worker.js`) erhoet Deployment-Komplexitaet
- Worker hat Node.js-Zugriff (Defense-in-Depth via AstValidator + new Function)
- Mobile bleibt bei V8-Origin-Isolation (Architektur-Limitierung von iOS/Android)

---

## Referenzen

- `_devprocess/analysis/security/AUDIT-obsilo-2026-03-01.md` -- Security Audit, Finding H-1
- `_devprocess/analysis/security/ANALYSE-electron-browserwindow-sandbox-2026-03-02.md` -- Detaillierte Optionen-Analyse
- `_devprocess/requirements/features/FEATURE-sandbox-os-isolation.md` -- Feature-Spezifikation
- `_devprocess/requirements/features/FEATURE-self-development.md` -- Urspruengliche Sandbox-Spezifikation (Phase 3)
