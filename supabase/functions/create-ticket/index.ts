// Production Discord Webhook Asymmetric Ed25519 Verification Handler v4
import { generateTicketEmbedding } from '../shared/embeddings.ts';
import { prepareRAGContext } from '../shared/rag.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import nacl from 'npm:tweetnacl@1.0.3';

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!;
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper utility to safely convert Discord's hexadecimal signature headers to Uint8Array
function hexToUint8Array(hex: string) {
  if (!hex) return new Uint8Array(0);
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((val) => parseInt(val, 16)));
}

Deno.serve(async (request: Request) => {
  // Handle CORS Preflight requests for cross-origin compliance
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Signature-Ed25519, X-Signature-Timestamp',
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. Grab asymmetric verification headers sent by Discord
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  
  // 2. Read the RAW string request body immediately (MUST NOT modify spaces/newlines)
  const rawBodyText = await request.text();

  if (!signature || !timestamp) {
    return new Response('Missing Ed25519 signature headers', { status: 401 });
  }

  // 3. Construct the verification payload precisely: Value = Timestamp + Raw Body String
  const signatureData = new TextEncoder().encode(timestamp + rawBodyText);
  
  let isVerified = false;
  try {
    isVerified = nacl.sign.detached.verify(
      signatureData,
      hexToUint8Array(signature),
      hexToUint8Array(DISCORD_PUBLIC_KEY)
    );
  } catch (err) {
    console.error('Cryptographic evaluation error:', err);
  }

  if (!isVerified) {
    console.error('Ed25519 public-key signature verification failed.');
    return new Response('Invalid request signature', { status: 401 });
  }

  // Parse payload safely now that signature verification passed
  const interaction = JSON.parse(rawBodyText);

  // 4. PING-PONG Challenge Handler (Mandatory Validation Step)
  // Interaction type 1 = Discord verification ping
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), { // Response type 1 = Pong response
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }

  // 5. Slash Command Logic Handler (Interaction Type 2)
  if (interaction.type === 2) {
    const { name, options } = interaction.data;

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
            data: { content: '❌ Fields missing: subject and description required.' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Handle RAG data mapping asynchronously to bypass Discord's 3-second network cutoff
      // @ts-ignore: EdgeRuntime is available inside the Supabase Deno cloud runtime
      globalThis.EdgeRuntime.waitUntil(
        (async () => {
          try {
            const embedding = await generateTicketEmbedding(subject, message);

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

            const ragContext = await prepareRAGContext(supabase, `${subject}: ${message}`, embedding, {
              matchCount: 3,
              minSimilarity: 0.3,
              includeResolvedOnly: true,
            });

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

            // Fixed trailing slash issue on URL structure path line below
            await fetch(`https://discord.com{interaction.application_id}/${interactionToken}/messages/@original`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              },
              body: JSON.stringify({ content: responseString }),
            });

          } catch (err) {
            console.error('Background execution crash:', err);
            // Fixed trailing slash issue on URL structure path line below
            await fetch(`https://discord.com{interaction.application_id}/${interactionToken}/messages/@original`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` },
              body: JSON.stringify({ content: `❌ Critical error processing AI RAG data mappings.` }),
            });
          }
        })()
      );

      // Instantly acknowledge the slash command to stop Discord from displaying an error
      return new Response(
        JSON.stringify({
          type: 5, // Response Type 5 = Defer Channel Message (displays "Bot is thinking...")
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Unsupported action payload structure' }), { status: 400 });
});
