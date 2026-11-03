// Supabase Edge Function: List tickets with filters
// GET /functions/v1/list-tickets

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createResponse, createErrorResponse, handleCORS, formatError } from '../shared/utils.ts';
import type { Ticket } from '../shared/types.ts';

interface ListTicketsOptions {
  status?: string;
  priority?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

serve(async (request: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    // Parse query parameters
    const url = new URL(request.url);
    const options: ListTicketsOptions = {
      status: url.searchParams.get('status') || undefined,
      priority: url.searchParams.get('priority') || undefined,
      category: url.searchParams.get('category') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
      offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
    };

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

    // Build query
    let query = supabase.from('tickets').select();

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.priority) {
      query = query.eq('priority', options.priority);
    }
    if (options.category) {
      query = query.eq('category', options.category);
    }

    // Apply pagination
    query = query.range(options.offset, options.offset + options.limit - 1);
    
    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    // Execute query
    const { data: tickets, error } = await query;

    if (error) {
      console.error('Error listing tickets:', error);
      return createErrorResponse(`Failed to list tickets: ${error.message}`);
    }

    return createResponse<Ticket[]>(tickets as unknown as Ticket[]);

  } catch (error) {
    console.error('Error in list-tickets function:', error);
    return createErrorResponse(formatError(error), 500);
  }
});
