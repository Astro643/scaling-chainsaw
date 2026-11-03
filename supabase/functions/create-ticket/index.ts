// Supabase Edge Function: Create a new ticket with RAG context
// POST /functions/v1/create-ticket

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { generateTicketEmbedding } from '../shared/embeddings.ts';
import { prepareRAGContext } from '../shared/rag.ts';
import { createResponse, createErrorResponse, handleCORS, parseBody, validateRequired, formatError } from '../shared/utils.ts';
import type { TicketInput, Ticket, RAGContext } from '../shared/types.ts';

interface CreateTicketRequest extends TicketInput {
  matchCount?: number;
  minSimilarity?: number;
  maxContextLength?: number;
}

interface CreateTicketResponse {
  ticket: Ticket;
  ragContext: RAGContext;
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
    const body = await parseBody<CreateTicketRequest>(request);

    // Validate required fields
    validateRequired(body, ['subject', 'message']);

    // Get Supabase client from context
    // Note: In Supabase Edge Functions, the client is available via request context
    // For local testing, we need to create it differently
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return createErrorResponse('Supabase configuration missing');
    }

    // Import here to avoid circular dependencies
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.0');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate embedding for the ticket
    const embedding = await generateTicketEmbedding(body.subject, body.message);

    // Prepare ticket data
    const ticketData = {
      subject: body.subject,
      message: body.message,
      embedding,
      status: 'open',
      priority: body.priority || 'medium',
      category: body.category || null,
      metadata: body.metadata || null,
    };

    // Insert into Supabase
    const { data: ticket, error: insertError } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating ticket:', insertError);
      return createErrorResponse(`Failed to create ticket: ${insertError.message}`);
    }

    // Generate RAG context
    const ragContext = await prepareRAGContext(
      supabase,
      `${body.subject}: ${body.message}`,
      embedding,
      {
        matchCount: body.matchCount || 5,
        minSimilarity: body.minSimilarity || 0.3,
        includeResolvedOnly: true,
        maxContextLength: body.maxContextLength || 4000,
      }
    );

    const responseData: CreateTicketResponse = {
      ticket: ticket as unknown as Ticket,
      ragContext,
    };

    return createResponse<CreateTicketResponse>(responseData, 201);

  } catch (error) {
    console.error('Error in create-ticket function:', error);
    return createErrorResponse(formatError(error), 500);
  }
});
