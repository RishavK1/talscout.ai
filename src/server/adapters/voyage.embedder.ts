import { getEnv } from "@/server/config/env";
import type { Embedder } from "@/server/ports";

/**
 * Real embeddings via Voyage AI (no official SDK → REST). voyage-3 returns
 * 1024-dim vectors, matching our pgvector column.
 */
export class VoyageEmbedder implements Embedder {
  readonly dimensions = 1024;

  async embed(text: string): Promise<number[]> {
    const env = getEnv();
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: [text.slice(0, 32_000)],
        model: env.VOYAGE_MODEL,
        input_type: "document",
      }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings failed: ${res.status}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    const vec = json.data?.[0]?.embedding;
    if (!vec || vec.length !== this.dimensions) {
      throw new Error("Voyage returned an unexpected embedding shape");
    }
    return vec;
  }
}
