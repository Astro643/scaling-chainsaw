// Embedding service for Supabase Edge Functions using Google Gemini
// Generates 768-dimensional embeddings using textembedding-gecko-001

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/embeddings:embedText';

// Default model - Gecko produces 768-dimensional vectors
const DEFAULT_MODEL = 'models/textembedding-gecko-001';

interface GeminiEmbeddingRequest {
  model: string;
  content: string;
}

interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Generate embedding for a single text input using Google Gemini
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable.');
  }

  const request: GeminiEmbeddingRequest = {
    model: DEFAULT_MODEL,
    content: text,
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data: GeminiEmbeddingResponse = await response.json();

  if (!data.embedding?.values) {
    throw new Error('Invalid embedding response from Gemini');
  }

  return {
    embedding: data.embedding.values,
    model: DEFAULT_MODEL,
    dimensions: data.embedding.values.length,
  };
}

/**
 * Generate embedding for a ticket (combines subject and message)
 */
export async function generateTicketEmbedding(subject: string, message: string): Promise<number[]> {
  const combinedText = `Subject: ${subject}\n\nMessage: ${message}`;
  const { embedding } = await generateEmbedding(combinedText);
  return embedding;
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<Array<{ embedding: number[]; model: string; dimensions: number }>> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is required');
  }

  if (texts.length === 0) {
    return [];
  }

  const results: Array<{ embedding: number[]; model: string; dimensions: number }> = [];

  // Process each text individually (Gemini embeddings API processes one text at a time)
  for (const text of texts) {
    const result = await generateEmbedding(text);
    results.push(result);
  }

  return results;
}
