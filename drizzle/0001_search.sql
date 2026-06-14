-- HNSW index for fast approximate nearest-neighbour search on candidate
-- embeddings (cosine distance). Applied by db setup after 0000_init.
CREATE INDEX IF NOT EXISTS candidates_embedding_hnsw
  ON candidates USING hnsw (embedding vector_cosine_ops);
