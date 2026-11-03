import { generateTicketEmbedding } from '../shared/embeddings.ts';
import { prepareRAGContext } from '../shared/rag.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import nacl from 'npm:tweetnacl@1.0.3';

// 1. Gather our critical Environment Secrets from the Supabase Platform
const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!;
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Setup an authenticated inner admin client to write code to our tickets table
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper utility to convert Discord's security headers to raw arrays
function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)));
}

// Start our native Deno Web Server
Deno.serve(async (request: Request) => {
  // Only process POST requests from Discord
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 2. Validate Security Signature (Mandatory: Prevents hackers from spoofing commands)
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const bodyText = await request.text();

  if (!signature || !timestamp) {
    return new Response('Missing request signatures', { status: 401 });
  }

  const isVerified = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + bodyText),
    hexToUint8Array(signature),
    hexToUint8Array(DISCORD_PUBLIC_KEY)
  );

  if (!isVerified) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(bodyText);

  // 3. Handle Discord's initial test connection check (PING / Type 1)
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Check if a User triggered a Slash Command (Type 2)
  if (interaction.type === 2) {
    const { name, options } = interaction.data;

    // Check if they ran your specific ticket command
    if (name === 'ticket') {
      // Pull variables out of the slash command inputs
      const subject = options.find((opt: any) => opt.name === 'subject')?.value;
      const message = options.find((opt: any) => opt.name === 'description')?.value;
      const category = options.find((opt: any) => opt.name === 'category')?.value || 'discord';
      
      const discordUserId = interaction.member?.user?.id || interaction.user?.id;
      const interactionToken = interaction.token; // Unique token to update our message later

      if (!subject || !message) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: '❌ Missing required fields: subject and description.' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ⏳ BEAT THE 3-SECOND WINDOW: Tell Discord we are looking into it immediately
      // This sends a silent background "Bot is thinking..." status to the user.
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

            // E. Follow up with Discord to overwrite the "Thinking..." text using the webhook route
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
            // Inform user if the background vector execution crashed
            await fetch(`https://discord.com{interaction.application_id}/${interactionToken}/messages/@original`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` },
              body: JSON.stringify({ content: `❌ An issue occurred while processing your AI ticket.` }),
            });
          }
        })()
      );

      // Return the initial 200 HTTP payload instantly to stop Discord from timing out
      return new Response(
        JSON.stringify({
          type: 5, // Type 5 = Deferred Channel Message With Source ("Bot is thinking...")
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown interaction' }), { status: 400 });
});
