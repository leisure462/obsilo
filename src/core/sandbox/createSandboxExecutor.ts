/**
 * createSandboxExecutor
 *
 * Platform-aware factory for sandbox execution backends.
 * Desktop (auto): ProcessSandboxExecutor (OS-level child_process.fork())
 * Mobile (auto):  IframeSandboxExecutor (iframe sandbox="allow-scripts")
 *
 * See ADR-021: Sandbox OS-Level Process Isolation.
 */

import { Platform } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ISandboxExecutor } from './ISandboxExecutor';
import { IframeSandboxExecutor } from './IframeSandboxExecutor';

export function createSandboxExecutor(
    plugin: ObsidianAgentPlugin,
    mode: 'auto' | 'process' | 'iframe' = 'auto',
): ISandboxExecutor {
    if (mode === 'iframe' || (mode === 'auto' && !Platform.isDesktop)) {
        return new IframeSandboxExecutor(plugin);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- child_process only via dynamic require in Electron renderer (same pattern as SafeStorageService)
    const { ProcessSandboxExecutor } = require('./ProcessSandboxExecutor') as
        { ProcessSandboxExecutor: new (p: ObsidianAgentPlugin) => ISandboxExecutor };
    return new ProcessSandboxExecutor(plugin);
}
