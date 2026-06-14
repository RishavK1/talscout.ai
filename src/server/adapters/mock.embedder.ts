import type { Embedder } from "@/server/ports";

/** Deterministic 1024-dim embedder for dev/test. Same text → same vector
 *  (SRCH-08), normalized so cosine/L2 behave sensibly. */
export class MockEmbedder implements Embedder {
  readonly dimensions = 1024;

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      v[i % this.dimensions] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
