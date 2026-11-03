// Supabase Edge Function: Search for similar tickets using RAG
// POST /functions/v1/search-tickets

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { generateTicketEmbedding } from '../shared/embeddings.ts';
import { prepareRAGContext } from '../shared/rag.ts';
import { createResponse, createErrorResponse, handleCORS, parseBody, validateRequired, formatError } from '../shared/utils.ts';
import type { RAGContext } from '../shared/types.ts';

interface SearchTicketsRequest {
  query: string;
  matchCount?: number;
  minSimilarity?: number;
  includeResolvedOnly?: boolean;
  categoryFilter?: string;
  maxContextLength?: number;
}

serve(async (request: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    // Only allow POST
    if (request.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405);
    }

    // Parse request body
    const body = await parseBody<SearchTicketsRequest>(request);

    // Validate required fields
    validateRequired(body, ['query']);

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return createErrorResponse('Supabase configuration missing');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.0');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate embedding for the query
    const embedding = await generateTicketEmbedding(body.query, '');

    // Generate RAG context
    const ragContext = await prepareRAGContext(
      supabase,
      body.query,
      embedding,
      {
        matchCount: body.matchCount || 5,
        minSimilarity: body.minSimilarity || 0.3,
        includeResolvedOnly: body.includeResolvedOnly || true,
        maxContextLength: body.maxContextLength || 4000,
      }
    );

    return createResponse<RAGContext>(ragContext);

  } catch (error) {
    console.error('Error in search-tickets function:', error);
    return createErrorResponse(formatError(error), 500);
  }
});
