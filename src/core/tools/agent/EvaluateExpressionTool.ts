/**
 * EvaluateExpressionTool
 *
 * Executes a one-off JavaScript/TypeScript expression in the sandbox.
 * Useful for data transformations, regex testing, calculations, etc.
 * No persistent tool is created — just immediate execution.
 *
 * Part of Self-Development Phase 3: Sandbox + Dynamic Modules.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { ISandboxExecutor } from '../../sandbox/ISandboxExecutor';
import type { EsbuildWasmManager } from '../../sandbox/EsbuildWasmManager';
import { AstValidator } from '../../sandbox/AstValidator';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface EvaluateExpressionInput {
    expression: string;
    context?: Record<string, unknown>;
    dependencies?: string[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class EvaluateExpressionTool extends BaseTool<'evaluate_expression'> {
    readonly name = 'evaluate_expression' as const;
    readonly isWriteOperation = false;

    constructor(
        plugin: ObsidianAgentPlugin,
        private sandboxExecutor: ISandboxExecutor,
        private esbuildManager: EsbuildWasmManager,
    ) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: this.name,
            description: 'Execute TypeScript/JavaScript in an isolated sandbox. Provides ctx.vault (read, readBinary, write, writeBinary, list) and ctx.requestUrl (HTTPS CDN-only). No Blob, Buffer, DOM, require, fetch available. Binary output: ArrayBuffer/Uint8Array (outputType:"arraybuffer"). npm packages via dependencies param (browser ESM from esm.sh). NEVER write Python.',
            input_schema: {
                type: 'object',
                properties: {
                    expression: {
                        type: 'string',
                        description: 'The TypeScript/JavaScript expression or code to evaluate. Must return a value. Use ctx.vault for file I/O and ctx.requestUrl for HTTP.',
                    },
                    context: {
                        type: 'object',
                        description: 'Optional context variables available as "ctx" inside the expression.',
                    },
                    dependencies: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional npm package names to bundle (e.g. ["pptxgenjs", "xlsx"]). When provided, packages are fetched from CDN and bundled with esbuild.',
                    },
                },
                required: ['expression'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const params = input as unknown as EvaluateExpressionInput;

        try {
            if (!params.expression) {
                throw new Error('Missing "expression".');
            }

            // AST validation (supplementary)
            const validation = AstValidator.validate(params.expression);
            if (!validation.valid) {
                throw new Error(`Expression validation failed:\n${validation.errors.join('\n')}`);
            }

            // Hoist import statements to module level (imports are invalid inside function bodies)
            const lines = params.expression.split('\n');
            const imports: string[] = [];
            const bodyLines: string[] = [];
            for (const line of lines) {
                // Match static imports (import X from 'y') but NOT dynamic import()
                if (/^\s*import\s+/.test(line) && !line.includes('import(')) {
                    imports.push(line);
                } else {
                    bodyLines.push(line);
                }
            }
            const bodyCode = bodyLines.join('\n');
            const hasReturn = bodyCode.includes('return');

            const wrappedSource = `
${imports.join('\n')}

export const definition = { name: '_eval', description: 'eval' };
export async function execute(input: Record<string, unknown>, ctx: { vault: any; requestUrl: any }): Promise<unknown> {
    const context = input.context || {};
    ${hasReturn ? bodyCode : `return (${bodyCode})`};
}
`;

            const compiledJs = (params.dependencies?.length)
                ? await this.esbuildManager.build(wrappedSource, params.dependencies)
                : await this.esbuildManager.transform(wrappedSource);
            const result = await this.sandboxExecutor.execute(compiledJs, {
                context: params.context ?? {},
            });

            const output = typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2);

            callbacks.pushToolResult(this.formatSuccess(output));
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }
}
