// OpenAI embedding service for Supabase Edge Functions
// Uses Deno's native fetch with ES modules

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

// Default model produces 1536-dimensional vectors
const DEFAULT_MODEL = 'text-embedding-ada-002';

interface OpenAIEmbeddingRequest {
  input: string | string[];
  model: string;
  user?: string;
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate embedding for a single text input
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is required');
  }

  const request: OpenAIEmbeddingRequest = {
    input: text,
    model: DEFAULT_MODEL,
    user: 'discord-ticketing-bot',
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();

  if (!data.data || !data.data[0]?.embedding) {
    throw new Error('Invalid embedding response from OpenAI');
  }

  return {
    embedding: data.data[0].embedding,
    model: data.model,
    dimensions: data.data[0].embedding.length,
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
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is required');
  }

  if (texts.length === 0) {
    return [];
  }

  const BATCH_SIZE = 2048;
  const batches = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const results: Array<{ embedding: number[]; model: string; dimensions: number }> = [];

  for (const batch of batches) {
    const request: OpenAIEmbeddingRequest = {
      input: batch,
      model: DEFAULT_MODEL,
      user: 'discord-ticketing-bot',
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data: OpenAIEmbeddingResponse = await response.json();
    
    data.data.forEach((item) => {
      results.push({
        embedding: item.embedding,
        model: data.model,
        dimensions: item.embedding.length,
      });
    });
  }

  return results;
}
