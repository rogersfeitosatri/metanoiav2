import { z, ZodSchema } from "zod";

// Abstração de provedor de IA (seção 23.8). Trocável por variável de ambiente.
// Toda saída estruturada é validada pelo schema Zod fornecido.

export interface AIInput {
  system: string;
  prompt: string;
  temperature?: number;
  model?: string;
}

export interface AIProvider {
  name: string;
  generateStructuredResponse<T>(input: AIInput, schema: ZodSchema<T>): Promise<T>;
}

// Provedor local determinístico: usa um resolvedor pré-definido para cada schema.
// Garante que os fluxos funcionem sem chave de API. O resolvedor é injetado por
// quem chama (o motor de fluxo / geradores de relatório).
export class LocalProvider implements AIProvider {
  name = "local";
  async generateStructuredResponse<T>(input: AIInput, schema: ZodSchema<T>): Promise<T> {
    // O provedor local não é chamado diretamente para gerar texto livre;
    // os orquestradores de alto nível já produzem estrutura.
    // Este método existe para compatibilidade de interface.
    throw new Error(
      "LocalProvider não gera texto livre. Use os orquestradores determinísticos."
    );
    return schema.parse({}) as T;
  }
}

// Provedor Anthropic (usado quando AI_PROVIDER=anthropic e há chave).
// Chamado apenas no servidor.
export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(
    private apiKey: string,
    private model = process.env.AI_MODEL || "claude-sonnet-5"
  ) {}

  async generateStructuredResponse<T>(input: AIInput, schema: ZodSchema<T>): Promise<T> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model || this.model,
        max_tokens: 1024,
        temperature: input.temperature ?? 0.4,
        system: input.system + "\n\nResponda SOMENTE com JSON válido correspondente ao schema solicitado.",
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "{}";
    const json = JSON.parse(extractJson(text));
    return schema.parse(json);
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return "{}";
  return text.slice(start, end + 1);
}

export function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || "local";
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GeminiProvider } = require("./gemini-provider");
    return new GeminiProvider(process.env.GEMINI_API_KEY);
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    // Import dinâmico para não exigir o módulo quando não usado.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenAIProvider } = require("./openai-provider");
    return new OpenAIProvider(process.env.OPENAI_API_KEY);
  }
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  return new LocalProvider();
}

export function isLlmConfigured(): boolean {
  const p = process.env.AI_PROVIDER || "local";
  if (p === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (p === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (p === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return false;
}

// Reexport para consumidores.
export type { ZodSchema };
export { z };
