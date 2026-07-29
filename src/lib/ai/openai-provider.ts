import { z, ZodSchema } from "zod";
import type { AIProvider, AIInput } from "./provider";

// Provedor OpenAI. Usado no servidor quando AI_PROVIDER=openai e há OPENAI_API_KEY.
// Retorna saída estruturada validada por Zod (nunca salvar texto não validado).
export class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(
    private apiKey: string,
    private model = process.env.AI_MODEL || "gpt-4o"
  ) {}

  async generateStructuredResponse<T>(input: AIInput, schema: ZodSchema<T>): Promise<T> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model || this.model,
        temperature: input.temperature ?? 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              input.system +
              "\n\nResponda SOMENTE com um objeto JSON válido correspondente ao schema solicitado, sem texto fora do JSON.",
          },
          { role: "user", content: input.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    const json = JSON.parse(text);
    return schema.parse(json);
  }
}

export { z };
