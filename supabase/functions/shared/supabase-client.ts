// Supabase client setup for Edge Functions
// Uses the provided Supabase client from context

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Get Supabase client from Edge Function context
// The client is automatically provided by Supabase Edge Functions runtime
export function getSupabaseClient(context: { supabase: any }) {
  return context.supabase;
}

// For admin operations (bypasses RLS)
// Note: In Edge Functions, the provided client already has the service role key
export function getSupabaseAdminClient(context: { supabase: any }) {
  return context.supabase;
}

// Standalone client for testing (not recommended for production Edge Functions)
export function createStandaloneClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
