import OpenAI from 'openai';
import { Ollama } from 'ollama';

// AI Service for intelligent orchestration
export class AIService {
  private openai: OpenAI | null = null;
  private ollama: Ollama | null = null;
  private provider: 'openai' | 'ollama' | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize OpenAI if API key available
    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (openaiKey) {
      this.openai = new OpenAI({
        apiKey: openaiKey,
        dangerouslyAllowBrowser: true,
      });
    }

    // Initialize Ollama (local)
    try {
      this.ollama = new Ollama({
        host: 'http://localhost:11434',
      });
    } catch (error) {
      console.warn('Ollama not available:', error);
    }
  }

  async chatCompletion(messages: any[], options: {
    provider?: 'openai' | 'ollama';
    model?: string;
    temperature?: number;
  } = {}) {
    const {
      provider = 'ollama', // Default to local Ollama
      model = provider === 'openai' ? 'gpt-4' : 'llama2',
      temperature = 0.7
    } = options;

    try {
      if (provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: 2000,
        });

        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'openai',
          model,
          usage: response.usage,
        };

      } else if (provider === 'ollama' && this.ollama) {
        const response = await this.ollama.chat({
          model,
          messages,
          options: {
            temperature,
            num_predict: 2000,
          },
        });

        return {
          content: response.message?.content || '',
          provider: 'ollama',
          model,
          usage: response.eval_count ? { tokens: response.eval_count } : undefined,
        };
      } else {
        throw new Error(`AI provider ${provider} not available`);
      }
    } catch (error) {
      console.error('AI service error:', error);
      throw error;
    }
  }

  async analyzeServerCapabilities(serverConfig: any) {
    const prompt = `Analyze this MCP server's capabilities and suggest intelligent orchestration strategies:

Server: ${serverConfig.name}
Description: ${serverConfig.description}
Capabilities: ${serverConfig.capabilities.join(', ')}
Tools: ${serverConfig.tools.join(', ')}

Provide a brief analysis of:
1. Primary use cases
2. Integration opportunities
3. Performance considerations
4. Security implications

Keep response under 200 words.`;

    const messages = [
      {
        role: 'system',
        content: 'You are an AI assistant analyzing MCP server capabilities for intelligent orchestration.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return await this.chatCompletion(messages, {
      provider: 'ollama', // Use local for analysis
      model: 'llama2',
      temperature: 0.3
    });
  }

  async suggestToolRouting(servers: any[], userIntent: string) {
    const serverList = servers.map(s => `${s.id}: ${s.capabilities.join(', ')}`).join('\n');

    const prompt = `Given these MCP servers and user intent, suggest the best server(s) to handle the request:

Available Servers:
${serverList}

User Intent: "${userIntent}"

Return JSON with:
{
  "primary_server": "server_id",
  "fallback_servers": ["server_id"],
  "reasoning": "brief explanation",
  "confidence": 0-100
}`;

    const messages = [
      {
        role: 'system',
        content: 'You are an intelligent router for MCP server orchestration. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.chatCompletion(messages, {
      provider: 'ollama',
      model: 'llama2',
      temperature: 0.1
    });

    try {
      return JSON.parse(response.content);
    } catch (error) {
      console.error('Failed to parse AI routing response:', error);
      return {
        primary_server: servers[0]?.id,
        fallback_servers: [],
        reasoning: 'Fallback due to parsing error',
        confidence: 50
      };
    }
  }

  async optimizeFederationConfig(currentConfig: any) {
    const prompt = `Optimize this MCP federation configuration for better performance and reliability:

Current Config: ${JSON.stringify(currentConfig, null, 2)}

Suggest improvements for:
1. Load balancing
2. Health check intervals
3. Caching strategies
4. Error handling
5. Resource limits

Return JSON with optimization suggestions.`;

    const messages = [
      {
        role: 'system',
        content: 'You are a federation optimization expert. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.chatCompletion(messages, {
      provider: 'openai', // Use OpenAI for complex optimization
      model: 'gpt-4',
      temperature: 0.2
    });

    try {
      return JSON.parse(response.content);
    } catch (error) {
      console.error('Failed to parse optimization response:', error);
      return { suggestions: [] };
    }
  }

  getAvailableProviders() {
    return {
      openai: !!this.openai,
      ollama: !!this.ollama,
    };
  }
}

// Singleton instance
export const aiService = new AIService();

// Export convenience functions
export const analyzeServerCapabilities = (config: any) =>
  aiService.analyzeServerCapabilities(config);

export const suggestToolRouting = (servers: any[], intent: string) =>
  aiService.suggestToolRouting(servers, intent);

export const optimizeFederationConfig = (config: any) =>
  aiService.optimizeFederationConfig(config);

export const getAIProviders = () =>
  aiService.getAvailableProviders();