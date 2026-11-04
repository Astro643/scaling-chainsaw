// Embedding service for Supabase Edge Functions using Google Gemini
// Generates 3072-dimensional embeddings using gemini-embedding-001

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = 'https://googleapis.com/v1/models/gemini-embedding-001:embedContent';

// Default model - gemini-embedding-001 produces 3072-dimensional vectors
const DEFAULT_MODEL = 'gemini-embedding-001';

interface GeminiEmbeddingRequest {
  instances: Array<{
    content: string;
  }>;
}

interface GeminiEmbeddingResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

/**
 * Generate embedding for a single text input using Google Gemini
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable.');
  }

  const request: GeminiEmbeddingRequest = {
    instances: [
      {
        content: text,
      },
    ],
  };

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data: GeminiEmbeddingResponse = await response.json();

  if (!data.embeddings || !data.embeddings[0]?.values) {
    throw new Error('Invalid embedding response from Gemini');
  }

  return {
    embedding: data.embeddings[0].values,
    model: DEFAULT_MODEL,
    dimensions: data.embeddings[0].values.length,
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
 * Generate embeddings for multiple texts using Google Gemini
 * Note: Gemini processes one text at a time, so we iterate sequentially
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<Array<{ embedding: number[]; model: string; dimensions: number }>> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable.');
  }

  if (texts.length === 0) {
    return [];
  }

  const results: Array<{ embedding: number[]; model: string; dimensions: number }> = [];

  for (const text of texts) {
    const result = await generateEmbedding(text);
    results.push(result);
  }

  return results;
}
