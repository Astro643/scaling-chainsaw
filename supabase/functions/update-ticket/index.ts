// Supabase Edge Function: Update a ticket
// PUT /functions/v1/update-ticket

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createResponse, createErrorResponse, handleCORS, parseBody, validateRequired, formatError } from '../shared/utils.ts';
import type { Ticket } from '../shared/types.ts';

interface UpdateTicketRequest {
  id: string;
  status?: string;
  priority?: string;
  category?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

serve(async (request: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    // Only allow PUT
    if (request.method !== 'PUT') {
      return createErrorResponse('Method not allowed', 405);
    }

    // Parse request body
    const body = await parseBody<UpdateTicketRequest>(request);

    // Validate required fields
    validateRequired(body, ['id']);

    // Check if there are any fields to update
    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.priority) updates.priority = body.priority;
    if (body.category !== undefined) updates.category = body.category;
    if (body.resolution !== undefined) updates.resolution = body.resolution;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
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

    // Update ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating ticket:', error);
      return createErrorResponse(`Failed to update ticket: ${error.message}`);
    }

    return createResponse<Ticket>(ticket as unknown as Ticket);

  } catch (error) {
    console.error('Error in update-ticket function:', error);
    return createErrorResponse(formatError(error), 500);
  }
});
