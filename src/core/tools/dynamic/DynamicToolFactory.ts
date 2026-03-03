/**
 * DynamicToolFactory
 *
 * Creates BaseTool subclass instances from dynamic tool definitions.
 * Each dynamic tool runs in the ISandboxExecutor (process or iframe sandbox).
 *
 * Part of Self-Development Phase 3: Sandbox + Dynamic Modules.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolName, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { ISandboxExecutor } from '../../sandbox/ISandboxExecutor';
import type { DynamicToolDefinition } from './types';

// ---------------------------------------------------------------------------
// DynamicTool
// ---------------------------------------------------------------------------

class DynamicTool extends BaseTool {
    readonly name: ToolName;
    readonly isWriteOperation: boolean;

    constructor(
        private definition: DynamicToolDefinition,
        private compiledJs: string,
        private sandboxExecutor: ISandboxExecutor,
        plugin: ObsidianAgentPlugin,
    ) {
        super(plugin);
        this.name = definition.name as ToolName;
        this.isWriteOperation = definition.isWriteOperation ?? false;
    }

    getDefinition(): ToolDefinition {
        return {
            name: this.name,
            description: this.definition.description,
            input_schema: this.definition.input_schema,
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        try {
            const result = await this.sandboxExecutor.execute(this.compiledJs, input);
            const output = typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2);
            callbacks.pushToolResult(this.formatSuccess(output));
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class DynamicToolFactory {
    static create(
        definition: DynamicToolDefinition,
        compiledJs: string,
        sandboxExecutor: ISandboxExecutor,
        plugin: ObsidianAgentPlugin,
    ): BaseTool {
        return new DynamicTool(definition, compiledJs, sandboxExecutor, plugin);
    }
}
