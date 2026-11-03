# Supabase Edge Functions Deployment Guide

This guide explains how to deploy the Discord Bot AI Ticketing System using **Supabase Edge Functions**.

## Overview

This implementation uses **Supabase Edge Functions** (Deno-based) instead of Next.js, making it:
- **Faster**: Edge Functions run closer to users
- **Cheaper**: Pay-per-use pricing model
- **Simpler**: No server management needed
- **Scalable**: Automatically scales with demand

## Project Structure

```
supabase/
├── config.toml
├── migrations/
│   └── 20240101000000_init_vector_ticketing.sql
└── functions/
    ├── shared/
    │   ├── types.ts
    │   ├── supabase-client.ts
    │   ├── embeddings.ts
    │   ├── rag.ts
    │   └── utils.ts
    ├── create-ticket/
    │   └── index.ts
    ├── search-tickets/
    │   └── index.ts
    ├── get-ticket/
    │   └── index.ts
    ├── update-ticket/
    │   └── index.ts
    └── list-tickets/
        └── index.ts
.env.example
.gitignore
package.json
```

## Prerequisites

1. **Supabase Account**: [Sign up at supabase.com](https://supabase.com)
2. **Supabase CLI**: Install the CLI
   ```bash
   npm install -g supabase
   ```
3. **Project Setup**: Create a new Supabase project

## Installation

### 1. Clone the Repository

```bash
cd scaling-chainsaw
```

### 2. Link to Your Supabase Project

```bash
supabase login
supabase link --project-ref your-project-ref
```

Find your project reference in Supabase Dashboard -> Project Settings -> General

## Database Setup

### 1. Apply Migration

```bash
supabase db push --db-url $SUPABASE_DB_URL
```

Or apply manually via Supabase Dashboard -> SQL Editor:
```sql
-- Copy contents of: supabase/migrations/20240101000000_init_vector_ticketing.sql
```

### 2. Verify Database

Check that the `tickets` table was created with the `embedding` column and `match_tickets` function.

## Environment Variables

### Set Project Secrets

In Supabase Dashboard -> Project Settings -> Secrets:
```
OPENAI_API_KEY=your-openai-api-key
```

### Local Development (Optional)

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_DB_URL=postgresql://postgres:password@localhost:5432/postgres
```

## Deploy Edge Functions

### Deploy All Functions

```bash
supabase functions deploy --project-ref $SUPABASE_PROJECT_REF
```

### Deploy Specific Function

```bash
supabase functions deploy create-ticket --project-ref $SUPABASE_PROJECT_REF
```

### Verify Deployment

Check Supabase Dashboard -> Edge Functions to see your deployed functions.

## Local Testing

### Start Local Supabase

```bash
supabase start
```

### Run Functions Locally

```bash
supabase functions serve
```

### Test Endpoints

#### Create a Ticket
```bash
curl -X POST http://localhost:54321/functions/v1/create-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "subject": "Discord bot not responding",
    "message": "My bot stopped responding to commands...",
    "category": "technical",
    "priority": "high"
  }'
```

#### Search Similar Tickets
```bash
curl -X POST http://localhost:54321/functions/v1/search-tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "query": "Bot is offline",
    "matchCount": 3,
    "minSimilarity": 0.5
  }'
```

#### Get a Specific Ticket
```bash
curl -X GET "http://localhost:54321/functions/v1/get-ticket?id=ticket-uuid" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### List Tickets
```bash
curl -X GET "http://localhost:54321/functions/v1/list-tickets?status=open&limit=10" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Update a Ticket
```bash
curl -X PUT http://localhost:54321/functions/v1/update-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "id": "ticket-uuid",
    "status": "resolved",
    "resolution": "User was able to login after password reset"
  }'
```

## Production Deployment

### Deploy Database

```bash
supabase db push --db-url $SUPABASE_DB_URL
```

### Deploy Functions

```bash
supabase functions deploy --project-ref $SUPABASE_PROJECT_REF
```

### API Endpoints (Production)

After deployment, your functions will be available at:
```
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/functions/v1/create-ticket` | Create ticket with RAG context |
| POST | `/functions/v1/search-tickets` | Search similar tickets |
| GET | `/functions/v1/get-ticket?id=<id>` | Get specific ticket |
| GET | `/functions/v1/list-tickets` | List tickets with filters |
| PUT | `/functions/v1/update-ticket` | Update ticket |

### Example: Create Ticket (Production)

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/create-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "subject": "Discord bot not responding",
    "message": "My bot stopped responding to commands...",
    "category": "technical",
    "priority": "high"
  }'
```

## Discord Bot Integration

### Example Discord Bot Code

```typescript
import { Client, GatewayIntentBits, Message } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  
  if (message.content.startsWith('!ticket')) {
    const parts = message.content.split(' ');
    if (parts.length < 3) {
      await message.reply('Usage: !ticket <subject> <description>');
      return;
    }
    
    const [, subject, ...messageParts] = parts;
    const description = messageParts.join(' ');
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          subject,
          message: description,
          category: 'discord',
          metadata: {
            discordUserId: message.author.id,
            discordGuildId: message.guildId,
            discordChannelId: message.channelId,
          },
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const { ticket, ragContext } = result.data;
        
        await message.reply(`Ticket created: **${subject}** (ID: ${ticket.id})`);
        
        if (ragContext.similar_tickets.length > 0) {
          const suggestions = ragContext.similar_tickets
            .filter(t => t.resolution)
            .map(t => `• Similar issue resolved: ${t.resolution}`)
            .join('\n');
          
          if (suggestions) {
            await message.reply(`Suggested Solutions:\n${suggestions}`);
          }
        }
        
      } else {
        await message.reply(`Error creating ticket: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      await message.reply('An error occurred while creating your ticket.');
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

## Monitoring

- **Supabase Dashboard**: View function logs, metrics, and errors
- **Database**: Monitor query performance
- **Analytics**: Track function invocations and latency

## Security

1. **Environment Variables**: Never commit secrets to version control
2. **Service Role Key**: Only use in server-side API routes
3. **CORS**: Configure appropriately for your Discord bot
4. **Rate Limiting**: Consider adding rate limiting to API routes

## Troubleshooting

### Common Issues

1. **Function not found**: Deploy the function first
   ```bash
   supabase functions list
   supabase functions deploy <function-name>
   ```

2. **Database errors**: Check migration status
   ```bash
   supabase db status
   ```

3. **Authentication errors**: Verify service role key
4. **Timeout errors**: Optimize queries or increase timeout

### Debugging

```bash
# Local development with verbose logging
supabase functions serve --verbose

# View production logs
supabase functions logs --project-ref $SUPABASE_PROJECT_REF
```

## License

MIT

## Resources

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pgvector Extension](https://supabase.com/docs/guides/database/extensions/pgvector)
- [OpenAI Embeddings](https://platform.openai.com/docs/api-reference/embeddings)

---

**Built with love using Supabase Edge Functions, pgvector, and OpenAI**
