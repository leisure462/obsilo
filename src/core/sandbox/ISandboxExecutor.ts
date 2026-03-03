/**
 * ISandboxExecutor
 *
 * Strategy interface for sandbox code execution backends.
 * Desktop: ProcessSandboxExecutor (OS-level child_process.fork())
 * Mobile:  IframeSandboxExecutor (iframe sandbox="allow-scripts")
 *
 * Part of ADR-021: Sandbox OS-Level Process Isolation.
 */

export interface ISandboxExecutor {
    ensureReady(): Promise<void>;
    execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown>;
    destroy(): void;
}
