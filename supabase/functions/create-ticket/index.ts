// NPM Registry Build v3
import { generateTicketEmbedding } from '../shared/embeddings.ts';
import { prepareRAGContext } from '../shared/rag.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import nacl from 'npm:tweetnacl@1.0.3';

// 1. Fetch Environment Secrets from the Supabase Platform
const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!;
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper utility to convert Discord's security headers to raw arrays safely
function hexToUint8Array(hex: string) {
  if (!hex) return new Uint8Array(0);
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((val) => parseInt(val, 16)));
}

Deno.serve(async (request: Request) => {
  // Handle CORS Preflight requests smoothly
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature-Ed25519, X-Signature-Timestamp',
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 2. Extract Security Signatures
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  
  // Capture raw body text before parsing to guarantee string consistency
  const bodyText = await request.text();

  if (!signature || !timestamp) {
    return new Response('Missing request signatures', { status: 401 });
  }

  // 3. Cryptographic Verification Check
  let isVerified = false;
  try {
    isVerified = nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + bodyText),
      hexToUint8Array(signature),
      hexToUint8Array(DISCORD_PUBLIC_KEY)
    );
  } catch (err) {
    console.error('Signature calculation crash:', err);
  }

  if (!isVerified) {
    console.error('Cryptographic match failed for signature:', signature);
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(bodyText);

  // 4. Respond to Discord's PING check instantly (Type 1)
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }

  // 5. Check if a User triggered a Slash Command (Type 2)
  if (interaction.type === 2) {
    const { name, options } = interaction.data;

    // Check if they ran your specific ticket command
    if (name === 'ticket') {
      const subject = options?.find((opt: any) => opt.name === 'subject')?.value;
      const message = options?.find((opt: any) => opt.name === 'description')?.value;
      const category = options?.find((opt: any) => opt.name === 'category')?.value || 'discord';
      
      const discordUserId = interaction.member?.user?.id || interaction.user?.id;
      const interactionToken = interaction.token; 

      if (!subject || !message) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: '❌ Missing required fields: subject and description.' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ⏳ BEAT THE 3-SECOND WINDOW: Send an immediate "Thinking..." state
      // EdgeRuntime.waitUntil handles the RAG matching asynchronously in the background.
      EdgeRuntime.waitUntil(
        (async () => {
          try {
            // A. Generate embedding via Gemini
            const embedding = await generateTicketEmbedding(subject, message);

            // B. Write new ticket record to PostgreSQL
            const { data: ticket, error: insertError } = await supabase
              .from('tickets')
              .insert({
                subject,
                message,
                embedding,
                status: 'open',
                priority: 'medium',
                category,
                metadata: { discordUserId },
              })
              .select()
              .single();

            if (insertError) throw insertError;

            // C. Search historical tickets using your RAG context function
            const ragContext = await prepareRAGContext(supabase, `${subject}: ${message}`, embedding, {
              matchCount: 3,
              minSimilarity: 0.3,
              includeResolvedOnly: true,
            });

            // D. Build the final output message string
            let responseString = `🎟️ **New Ticket Opened!**\n**Subject:** ${ticket.subject}\n**ID:** \`${ticket.id}\`\n\n`;
            
            if (ragContext.similar_tickets.length > 0) {
              const suggestions = ragContext.similar_tickets
                .filter((t: any) => t.resolution)
                .map((t: any) => `• *Suggested Fix:* ${t.resolution}`)
                .join('\n');
              
              if (suggestions) {
                responseString += `💡 **AI Suggestions from Past Tickets:**\n${suggestions}`;
              }
            } else {
              responseString += `✨ No similar past problems found. Our support team will analyze this soon!`;
            }

            // E. Update Discord over standard webhooks using your DISCORD_BOT_TOKEN
            await fetch(`https://discord.com{interaction.application_id}/${interactionToken}/messages/@original`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              },
              body: JSON.stringify({ content: responseString }),
            });

          } catch (err) {
            console.error('Background processing error:', err);
            await fetch(`https://discord.com{interaction.application_id}/${interactionToken}/messages/@original`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` },
              body: JSON.stringify({ content: `❌ An error occurred while running AI ticket generation.` }),
            });
          }
        })()
      );

      // Return the Type 5 response instantly to satisfy Discord's gateway timeout
      return new Response(
        JSON.stringify({
          type: 5, 
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown interaction' }), { status: 400 });
});
