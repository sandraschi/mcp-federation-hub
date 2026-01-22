import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioServerParameters } from '@modelcontextprotocol/sdk/shared/stdio.js';

// MCP Client for direct stdio connections to MCP servers
class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private serverProcesses: Map<string, any> = new Map();

  async connectServer(serverId: string, serverConfig: any): Promise<Client> {
    // Check if already connected
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId)!;
    }

    // Create MCP client
    const client = new Client(
      {
        name: 'federation-dashboard',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          sampling: {}, // Enable sampling support
        },
      }
    );

    try {
      // Launch MCP server process
      const serverProcess = await this.launchMCPServer(serverConfig);

      // Connect via stdio
      await client.connect(serverProcess);

      // Store connection
      this.clients.set(serverId, client);
      this.serverProcesses.set(serverId, serverProcess);

      console.log(`Connected to MCP server: ${serverId}`);
      return client;

    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverId}:`, error);
      throw error;
    }
  }

  async launchMCPServer(serverConfig: any): Promise<any> {
    // This would launch the actual MCP server process
    // For now, return a mock stdio interface
    // In production, this would use child_process.spawn or similar

    const mockStdio = {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    };

    return mockStdio;
  }

  async callTool(serverId: string, toolName: string, arguments: any = {}) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Not connected to server: ${serverId}`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments,
      });

      return result;
    } catch (error) {
      console.error(`Tool call failed for ${serverId}.${toolName}:`, error);
      throw error;
    }
  }

  async listTools(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Not connected to server: ${serverId}`);
    }

    try {
      const tools = await client.listTools();
      return tools;
    } catch (error) {
      console.error(`Failed to list tools for ${serverId}:`, error);
      throw error;
    }
  }

  async listResources(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Not connected to server: ${serverId}`);
    }

    try {
      const resources = await client.listResources();
      return resources;
    } catch (error) {
      console.error(`Failed to list resources for ${serverId}:`, error);
      throw error;
    }
  }

  disconnectServer(serverId: string) {
    const client = this.clients.get(serverId);
    const process = this.serverProcesses.get(serverId);

    if (client) {
      client.close();
      this.clients.delete(serverId);
    }

    if (process) {
      // Terminate the server process
      process.kill();
      this.serverProcesses.delete(serverId);
    }

    console.log(`Disconnected from MCP server: ${serverId}`);
  }

  disconnectAll() {
    for (const serverId of this.clients.keys()) {
      this.disconnectServer(serverId);
    }
  }
}

// Singleton instance
export const mcpClientManager = new MCPClientManager();

// Export individual functions for easier use
export const connectToMCPServer = (serverId: string, config: any) =>
  mcpClientManager.connectServer(serverId, config);

export const callMCPTool = (serverId: string, toolName: string, args: any) =>
  mcpClientManager.callTool(serverId, toolName, args);

export const listMCPTools = (serverId: string) =>
  mcpClientManager.listTools(serverId);

export const listMCPResources = (serverId: string) =>
  mcpClientManager.listResources(serverId);

export const disconnectFromMCPServer = (serverId: string) =>
  mcpClientManager.disconnectServer(serverId);