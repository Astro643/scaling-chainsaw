// Supabase Edge Function: Get a specific ticket
// GET /functions/v1/get-ticket?id=<ticket-id>

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createResponse, createErrorResponse, handleCORS, formatError } from '../shared/utils.ts';
import type { Ticket } from '../shared/types.ts';

serve(async (request: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    // Parse ticket ID from query string
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return createErrorResponse('Ticket ID is required', 400);
    }

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

    // Fetch ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return createResponse<Ticket | null>(null, 200);
      }
      console.error('Error fetching ticket:', error);
      return createErrorResponse(`Failed to fetch ticket: ${error.message}`);
    }

    return createResponse<Ticket>(ticket as unknown as Ticket);

  } catch (error) {
    console.error('Error in get-ticket function:', error);
    return createErrorResponse(formatError(error), 500);
  }
});
