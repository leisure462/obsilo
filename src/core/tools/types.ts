/**
 * Tool Types and Interfaces
 *
 * Defines the core types for the tool system, adapted from Kilo Code's architecture.
 */

/**
 * Tool names (will expand as we add more tools)
 */
export type ToolName =
    | 'read_file'
    | 'write_file'
    | 'list_files'
    | 'search_files'
    | 'create_folder'
    | 'delete_file'
    | 'move_file'
    | 'apply_diff'
    | 'search_replace'
    | 'create_canvas'
    | 'semantic_search'
    | 'attempt_completion'
    | 'update_todo_list'
    | 'use_mcp_tool'; // For MCP tools (Phase 6)

/**
 * Tool use request from LLM
 */
export interface ToolUse {
    type: 'tool_use';
    id: string;
    name: ToolName;
    input: Record<string, any>;
}

/**
 * Tool result response
 */
export interface ToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

/**
 * Tool definition (schema) for LLM
 */
export interface ToolDefinition {
    name: ToolName;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * Tool callbacks for communicating results
 */
export interface ToolCallbacks {
    /**
     * Push a result to be sent back to the LLM
     */
    pushToolResult(content: string): void;

    /**
     * Handle an error during tool execution
     */
    handleError(toolName: string, error: unknown): Promise<void>;

    /**
     * Log a message (for debugging)
     */
    log(message: string): void;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
    /**
     * Current task ID
     */
    taskId: string;

    /**
     * Current mode
     */
    mode: string;

    /**
     * Callbacks for results
     */
    callbacks: ToolCallbacks;
}

/**
 * Validation result for tool operations
 */
export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    requiresExplicitApproval?: boolean;
}

/**
 * Approval decision
 */
export type ApprovalDecision = 'approve' | 'deny' | 'ask' | 'timeout';

/**
 * Approval result
 */
export interface ApprovalResult {
    decision: ApprovalDecision;
    timeout?: number;
    fn?: () => any;
}
