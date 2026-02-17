/**
 * AgentTask - The Conversation Loop
 *
 * Adapted from Kilo Code's src/core/task/Task.ts (strongly simplified).
 *
 * Handles the agentic loop:
 * 1. Send user message to LLM
 * 2. Stream response (text + tool calls)
 * 3. Execute tool calls via ToolExecutionPipeline
 * 4. Add tool results back to conversation
 * 5. Loop until no more tool calls (end_turn)
 */

import type { ApiHandler, MessageParam, ContentBlock } from '../api/types';
import type { ToolRegistry } from './tools/ToolRegistry';
import type { ToolCallbacks, ToolUse } from './tools/types';
import { ToolExecutionPipeline } from './tool-execution/ToolExecutionPipeline';
import { buildSystemPrompt } from './systemPrompt';

export interface AgentTaskCallbacks {
    /** Called for each streamed text chunk */
    onText: (text: string) => void;
    /** Called when a tool is about to be executed */
    onToolStart: (name: string, input: Record<string, any>) => void;
    /** Called when a tool has finished executing */
    onToolResult: (name: string, content: string, isError: boolean) => void;
    /** Called with cumulative token usage just before onComplete (Feature 6) */
    onUsage?: (inputTokens: number, outputTokens: number) => void;
    /** Called when the task is complete */
    onComplete: () => void;
    /** Called when an unrecoverable error occurs */
    onError: (error: Error) => void;
}

export class AgentTask {
    private api: ApiHandler;
    private toolRegistry: ToolRegistry;
    private taskCallbacks: AgentTaskCallbacks;

    constructor(
        api: ApiHandler,
        toolRegistry: ToolRegistry,
        taskCallbacks: AgentTaskCallbacks,
    ) {
        this.api = api;
        this.toolRegistry = toolRegistry;
        this.taskCallbacks = taskCallbacks;
    }

    /**
     * Run the agentic conversation loop.
     * Adapted from Kilo Code's Task.ts attemptApiRequest() and main loop.
     *
     * @param userMessage - The new user message
     * @param taskId - Unique task ID
     * @param mode - Current agent mode
     * @param history - Existing conversation history (mutated in-place to persist across calls)
     * @param abortSignal - Optional signal to cancel the request
     */
    async run(
        userMessage: string,
        taskId: string,
        mode: string,
        history: MessageParam[],
        abortSignal?: AbortSignal,
    ): Promise<void> {
        const systemPrompt = buildSystemPrompt(mode);
        const tools = this.toolRegistry.getToolDefinitions();

        // Create per-task pipeline instance (like Kilo Code creates per-task context)
        const pipeline = new ToolExecutionPipeline(
            (this.toolRegistry as any).plugin,
            this.toolRegistry,
            taskId,
            mode,
        );

        // Add user message to the shared history
        history.push({ role: 'user', content: userMessage });

        const MAX_ITERATIONS = 10; // Prevent runaway loops
        // Feature 6: Accumulate token usage across all iterations
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        try {
            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
                const toolUses: ContentBlock[] = [];
                const textParts: string[] = [];

                // Stream the LLM response (pass abort signal for cancellation)
                for await (const chunk of this.api.createMessage(systemPrompt, history, tools, abortSignal)) {
                    if (chunk.type === 'text') {
                        textParts.push(chunk.text);
                        this.taskCallbacks.onText(chunk.text);
                    } else if (chunk.type === 'tool_use') {
                        toolUses.push({
                            type: 'tool_use',
                            id: chunk.id,
                            name: chunk.name,
                            input: chunk.input,
                        });
                        // Notify UI that a tool is starting
                        this.taskCallbacks.onToolStart(chunk.name, chunk.input);
                    } else if (chunk.type === 'usage') {
                        // Feature 6: Accumulate tokens across all agentic iterations
                        totalInputTokens += chunk.inputTokens;
                        totalOutputTokens += chunk.outputTokens;
                    }
                }

                // Build the assistant message content
                const assistantContent: ContentBlock[] = [];
                if (textParts.length > 0) {
                    assistantContent.push({ type: 'text', text: textParts.join('') });
                }
                assistantContent.push(...toolUses);
                history.push({ role: 'assistant', content: assistantContent });

                // If no tool calls, the LLM is done
                if (toolUses.length === 0) {
                    break;
                }

                // Execute each tool call (sequential, like Kilo Code's default behavior)
                const toolResultBlocks: ContentBlock[] = [];

                for (const toolUse of toolUses) {
                    if (toolUse.type !== 'tool_use') continue;

                    // Create callbacks for this tool execution
                    const toolCallbacks: ToolCallbacks = {
                        pushToolResult: () => {}, // Results collected from pipeline return value
                        handleError: async (toolName, error) => {
                            console.error(`[AgentTask] Tool error in ${toolName}:`, error);
                        },
                        log: (message) => {
                            console.log(`[AgentTask] ${message}`);
                        },
                    };

                    const toolCall: ToolUse = {
                        type: 'tool_use',
                        id: toolUse.id,
                        name: toolUse.name as any,
                        input: toolUse.input,
                    };

                    const result = await pipeline.executeTool(toolCall, toolCallbacks);

                    // Notify UI of tool result
                    this.taskCallbacks.onToolResult(
                        toolUse.name,
                        result.content,
                        result.is_error ?? false,
                    );

                    // Add tool result for next LLM message
                    // (Anthropic protocol: tool_result blocks in a user message)
                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: result.content,
                        is_error: result.is_error,
                    });
                }

                // Add tool results as the next user message
                history.push({ role: 'user', content: toolResultBlocks });
            }

            // Feature 6: Report total token usage before completing
            if (totalInputTokens > 0 || totalOutputTokens > 0) {
                this.taskCallbacks.onUsage?.(totalInputTokens, totalOutputTokens);
            }
            this.taskCallbacks.onComplete();
        } catch (error) {
            // AbortError is expected when user cancels — not a real error
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[AgentTask] Task cancelled by user');
                this.taskCallbacks.onComplete();
                return;
            }
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[AgentTask] Task failed:', err);
            this.taskCallbacks.onError(err);
        }
    }
}
