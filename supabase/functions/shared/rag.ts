// RAG-based ticket search for Supabase Edge Functions

import type { SimilarTicket, RAGContext } from './types.ts';

/**
 * Find similar tickets using vector similarity search
 */
export async function findSimilarTickets(
  supabase: any,
  embedding: number[],
  options: {
    matchCount?: number;
    minSimilarity?: number;
    includeResolvedOnly?: boolean;
    categoryFilter?: string;
  } = {}
): Promise<SimilarTicket[]> {
  const {
    matchCount = 5,
    minSimilarity = 0.3,
    includeResolvedOnly = false,
    categoryFilter,
  } = options;

  // Call the match_tickets function via RPC
  const { data, error } = await supabase.rpc('match_tickets', {
    query_embedding: embedding,
    match_count: matchCount,
    min_similarity: minSimilarity,
  });

  if (error) {
    console.error('Error finding similar tickets:', error);
    throw new Error(`Failed to find similar tickets: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  let results = data as SimilarTicket[];
  
  if (categoryFilter) {
    results = results.filter(ticket => ticket.category === categoryFilter);
  }

  if (includeResolvedOnly) {
    results = results.filter(ticket => ticket.status === 'resolved' && ticket.resolution);
  }

  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

/**
 * Prepare RAG context payload for AI agents
 */
export async function prepareRAGContext(
  supabase: any,
  query: string,
  embedding: number[],
  options: {
    matchCount?: number;
    minSimilarity?: number;
    includeResolvedOnly?: boolean;
    maxContextLength?: number;
  } = {}
): Promise<RAGContext> {
  const {
    matchCount = 5,
    minSimilarity = 0.3,
    includeResolvedOnly = true,
    maxContextLength = 4000,
  } = options;

  const similarTickets = await findSimilarTickets(supabase, embedding, {
    matchCount,
    minSimilarity,
    includeResolvedOnly,
  });

  const contextParts: string[] = [];
  let currentLength = 0;

  similarTickets.forEach((ticket, index) => {
    const ticketContext = formatTicketForContext(ticket, index + 1);
    
    if (currentLength + ticketContext.length <= maxContextLength) {
      contextParts.push(ticketContext);
      currentLength += ticketContext.length;
    }
  });

  const context = contextParts.join('\n\n');

  const categories = similarTickets
    .map(t => t.category)
    .filter((c): c is string => !!c);
  
  const uniqueCategories = [...new Set(categories)];
  const averageSimilarity = similarTickets.length > 0
    ? similarTickets.reduce((sum, t) => sum + t.similarity, 0) / similarTickets.length
    : 0;

  return {
    query,
    similar_tickets: similarTickets,
    context: context || 'No similar historical tickets found.',
    metadata: {
      average_similarity: parseFloat(averageSimilarity.toFixed(4)),
      ticket_count: similarTickets.length,
      categories: uniqueCategories,
    },
  };
}

function formatTicketForContext(ticket: SimilarTicket, index: number): string {
  const resolutionInfo = ticket.resolution 
    ? `\nResolution: ${ticket.resolution}`
    : '';
  
  const categoryInfo = ticket.category 
    ? ` | Category: ${ticket.category}`
    : '';
  
  return `--- Historical Ticket #${index} (Similarity: ${(ticket.similarity * 100).toFixed(1)}%) ---
Subject: ${ticket.subject}${categoryInfo}
Priority: ${ticket.priority}
Status: ${ticket.status}${resolutionInfo}

Message: ${ticket.message}`;
}

/**
 * Get ticket statistics
 */
export async function getTicketStatistics(
  supabase: any,
  category?: string
): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  let query = supabase.from('tickets').select('status, priority, category');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching ticket statistics:', error);
    return {
      total: 0,
      byStatus: {},
      byPriority: {},
      byCategory: {},
    };
  }

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  data.forEach((ticket: any) => {
    byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;
    byPriority[ticket.priority] = (byPriority[ticket.priority] || 0) + 1;
    
    if (ticket.category) {
      byCategory[ticket.category] = (byCategory[ticket.category] || 0) + 1;
    }
  });

  return {
    total: data.length,
    byStatus,
    byPriority,
    byCategory,
  };
}
