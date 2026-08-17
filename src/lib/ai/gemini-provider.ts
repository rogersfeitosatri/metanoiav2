import { ZodSchema } from "zod";
import type { AIProvider, AIInput } from "./provider";

// Provedor Google Gemini. Usado quando AI_PROVIDER=gemini e há GEMINI_API_KEY.
// Assim como os demais, devolve saída estruturada validada por Zod.
export class GeminiProvider implements AIProvider {
  name = "gemini";
  constructor(
    private apiKey: string,
    private model = process.env.AI_MODEL || "gemini-3.6-flash"
  ) {}

  async generateStructuredResponse<T>(input: AIInput, schema: ZodSchema<T>): Promise<T> {
    const model = input.model || this.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Chave no cabeçalho (e não na URL) para não vazar em logs de acesso.
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                input.system +
                "\n\nResponda SOMENTE com um objeto JSON válido correspondente ao schema solicitado, sem texto fora do JSON.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.4,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return schema.parse(JSON.parse(extractJson(text)));
  }
}

// O modo JSON já devolve JSON puro, mas mantemos a rede de proteção.
function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return "{}";
  return trimmed.slice(start, end + 1);
}
