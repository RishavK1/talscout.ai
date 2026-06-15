import { getEnv } from "@/server/config/env";
import type { Embedder, EmbedInputType } from "@/server/ports";

/**
 * Real embeddings via Voyage AI (no official SDK → REST). voyage-3 returns
 * 1024-dim vectors, matching our pgvector column.
 *
 * Voyage is trained for ASYMMETRIC retrieval: the corpus and the search text
 * must be embedded with their respective `input_type`. Embedding both as
 * "document" — as this previously did — leaves ranking quality on the table.
 */
export class VoyageEmbedder implements Embedder {
  readonly dimensions = 1024;

  async embed(text: string, inputType: EmbedInputType = "document"): Promise<number[]> {
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
        input_type: inputType,
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
