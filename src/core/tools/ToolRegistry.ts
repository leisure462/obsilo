/**
 * ToolRegistry - Manages all available tools
 *
 * Central registry for:
 * - Internal vault operation tools
 * - MCP tools (added in Phase 6)
 * - Tool lookup and discovery
 */

import type ObsidianAgentPlugin from '../../main';
import type { BaseTool } from './BaseTool';
import type { ToolName, ToolDefinition } from './types';

// Import tools
import { ReadFileTool } from './vault/ReadFileTool';
import { WriteFileTool } from './vault/WriteFileTool';
import { ListFilesTool } from './vault/ListFilesTool';
import { SearchFilesTool } from './vault/SearchFilesTool';
import { CreateFolderTool } from './vault/CreateFolderTool';
import { DeleteFileTool } from './vault/DeleteFileTool';
import { MoveFileTool } from './vault/MoveFileTool';

export class ToolRegistry {
    private tools: Map<ToolName, BaseTool>;
    private plugin: ObsidianAgentPlugin;

    constructor(plugin: ObsidianAgentPlugin) {
        this.plugin = plugin;
        this.tools = new Map();
        this.registerInternalTools();
    }

    /**
     * Register all internal (built-in) tools
     */
    private registerInternalTools(): void {
        // Vault: read/write
        this.register(new ReadFileTool(this.plugin));
        this.register(new WriteFileTool(this.plugin));
        // Vault: navigation & search
        this.register(new ListFilesTool(this.plugin));
        this.register(new SearchFilesTool(this.plugin));
        // Vault: file management
        this.register(new CreateFolderTool(this.plugin));
        this.register(new DeleteFileTool(this.plugin));
        this.register(new MoveFileTool(this.plugin));

        console.log(`ToolRegistry: Registered ${this.getToolCount()} tools`);
    }

    /**
     * Register a tool
     */
    register(tool: BaseTool): void {
        if (this.tools.has(tool.name)) {
            console.warn(`ToolRegistry: Tool '${tool.name}' already registered, overwriting`);
        }
        this.tools.set(tool.name, tool);
        console.log(`ToolRegistry: Registered tool '${tool.name}'`);
    }

    /**
     * Get a tool by name
     */
    getTool(name: ToolName): BaseTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools
     */
    getAllTools(): BaseTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tool definitions (schemas) for LLM
     */
    getToolDefinitions(): ToolDefinition[] {
        return this.getAllTools().map((tool) => tool.getDefinition());
    }

    /**
     * Get tool definitions filtered by allowed tools
     * (used by Mode system to restrict tool access)
     */
    getFilteredToolDefinitions(allowedTools: ToolName[]): ToolDefinition[] {
        return allowedTools
            .map((name) => this.getTool(name))
            .filter((tool): tool is BaseTool => tool !== undefined)
            .map((tool) => tool.getDefinition());
    }

    /**
     * Check if a tool exists
     */
    hasTool(name: ToolName): boolean {
        return this.tools.has(name);
    }

    /**
     * Get number of registered tools
     */
    getToolCount(): number {
        return this.tools.size;
    }

    /**
     * Register an MCP tool (Phase 6)
     */
    registerMcpTool(serverName: string, toolName: string, tool: BaseTool): void {
        // TODO: Phase 6 - MCP integration
        // For now, just register it like a normal tool
        this.register(tool);
    }

    /**
     * Unregister a tool
     */
    unregister(name: ToolName): boolean {
        return this.tools.delete(name);
    }

    /**
     * Clear all tools (useful for testing)
     */
    clear(): void {
        this.tools.clear();
    }
}
