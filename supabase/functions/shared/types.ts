// Shared types for Supabase Edge Functions

export interface Ticket {
  id: string;
  subject: string;
  message: string;
  embedding: number[] | null;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  resolution: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TicketInput {
  subject: string;
  message: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface SimilarTicket {
  id: string;
  subject: string;
  message: string;
  resolution: string | null;
  category: string | null;
  priority: string;
  status: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

export interface RAGContext {
  query: string;
  similar_tickets: SimilarTicket[];
  context: string;
  metadata: {
    average_similarity: number;
    ticket_count: number;
    categories: string[];
  };
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
}

// Supabase function types
export interface SupabaseFunctionRequest {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

export interface SupabaseFunctionContext {
  request: Request;
  supabase: any;
}
