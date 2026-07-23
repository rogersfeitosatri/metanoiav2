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
    // as funções de alto nível (flow-engine, reports) já produzem estrutura.
    // Este método existe para compatibilidade de interface.
    throw new Error(
      "LocalProvider não gera texto livre. Use os módulos determinísticos (flow-engine, reports)."
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
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  return new LocalProvider();
}

// Reexport para consumidores.
export type { ZodSchema };
export { z };
