-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tickets table with vector embeddings for RAG
CREATE TABLE IF NOT EXISTS tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  embedding vector(3072),  -- Google Gemini gemini-embedding-001 produces 3072-dimensional vectors
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category TEXT,
  resolution TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on embedding column for fast similarity search
CREATE INDEX IF NOT EXISTS idx_tickets_embedding ON tickets USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function for similarity search using cosine distance
-- Returns top N most similar tickets based on embedding similarity
CREATE OR REPLACE FUNCTION match_tickets(
  query_embedding vector(3072),
  match_count INT DEFAULT 5,
  min_similarity FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  subject TEXT,
  message TEXT,
  resolution TEXT,
  category TEXT,
  priority TEXT,
  status TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.subject,
    t.message,
    t.resolution,
    t.category,
    t.priority,
    t.status,
    t.metadata,
    1 - (t.embedding <=> query_embedding)::FLOAT AS similarity
  FROM tickets t
  WHERE t.embedding IS NOT NULL
    AND (1 - (t.embedding <=> query_embedding)::FLOAT) >= min_similarity
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- Create index on priority for filtering
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
