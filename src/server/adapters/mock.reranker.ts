import type { Reranker, RerankDocument, RerankResult } from "@/server/ports";

/**
 * Identity reranker for dev/test. Preserves the input order (the vector
 * ranking) and assigns gently decreasing scores, so the deterministic search
 * tests (which assert pure cosine ordering) keep passing. The real
 * GeminiReranker reorders by holistic relevance in live mode.
 */
export class MockReranker implements Reranker {
  async rerank(query: string, documents: RerankDocument[]): Promise<RerankResult[]> {
    return documents.map((d, i) => ({
      id: d.id,
      score: documents.length > 1 ? 1 - i / documents.length : 1,
    }));
  }
}
