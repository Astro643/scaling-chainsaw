# Discord Bot AI Ticketing System with RAG

A **Supabase Edge Functions** based ticketing system that uses Retrieval-Augmented Generation (RAG) with **Google Gemini embeddings** to provide AI agents with context from historical support tickets.

> **⚡ Built for Supabase Edge Functions (Deno) - Not Next.js**

## Features

- **Vector Embeddings**: Uses Google Gemini's textembedding-gecko-001 (768 dimensions) for semantic search
- **pgvector Integration**: Leverages Supabase's built-in vector extension for fast similarity searches
- **RAG Context**: Automatically finds similar historical tickets to provide context for AI responses
- **Serverless**: Runs on Supabase Edge Functions - fast, scalable, and cost-effective
- **Modular Design**: Clean separation of concerns with reusable utilities

## Architecture

```
Discord Bot --> Supabase Edge Functions (Deno)
    create-ticket/index.ts
    search-tickets/index.ts
    get-ticket/index.ts
    update-ticket/index.ts
    list-tickets/index.ts
        |
        v
Supabase Database
    pgvector extension | tickets table | match_tickets function
                                        |
                                    ivfflat index
                                    on embedding
```

## Project Structure

```
.
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20240101000000_init_vector_ticketing.sql
│   └── functions/
│       ├── shared/
│       │   ├── types.ts
│       │   ├── supabase-client.ts
│       │   ├── embeddings.ts
│       │   ├── rag.ts
│       │   └── utils.ts
│       ├── create-ticket/
│       │   └── index.ts
│       ├── search-tickets/
│       │   └── index.ts
│       ├── get-ticket/
│       │   └── index.ts
│       ├── update-ticket/
│       │   └── index.ts
│       └── list-tickets/
│           └── index.ts
├── .env.example
├── .gitignore
├── SUPABASE_DEPLOYMENT.md
└── package.json
```

## Quick Start

### 1. Deploy Database

```bash
supabase db push --db-url $SUPABASE_DB_URL
```

### 2. Set Environment Variables

In Supabase Dashboard → Project Settings → Secrets:
```
GEMINI_API_KEY=your-gemini-api-key
```

Get your key from: [Google AI Studio](https://aistudio.google.com/app/apikey)

### 3. Deploy Edge Functions

```bash
supabase functions deploy --project-ref $SUPABASE_PROJECT_REF
```

### 4. Test

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/create-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"subject": "Bot issue", "message": "My bot is not working"}'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/functions/v1/create-ticket` | Create ticket with RAG context |
| POST | `/functions/v1/search-tickets` | Search similar tickets |
| GET | `/functions/v1/get-ticket?id=<id>` | Get specific ticket |
| GET | `/functions/v1/list-tickets` | List tickets with filters |
| PUT | `/functions/v1/update-ticket` | Update ticket |

## Discord Bot Integration

```typescript
import { Client, GatewayIntentBits, Message } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || !message.content.startsWith('!ticket')) return;
  
  const [, subject, ...messageParts] = message.content.split(' ');
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
        },
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      const { ticket, ragContext } = result.data;
      
      await message.reply(`Ticket created: **${subject}** (ID: ${ticket.id})`);
      
      if (ragContext.similar_tickets.length > 0) {
        const suggestions = ragContext.similar_tickets
          .filter((t: any) => t.resolution)
          .map((t: any) => `- ${t.resolution}`)
          .join('\n');
        await message.reply(`Suggested Solutions:\n${suggestions}`);
      }
    } else {
      await message.reply(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
    await message.reply('An error occurred');
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

## Database Schema

### Tables
- **tickets**: Stores all support tickets with vector embeddings

### Columns
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| subject | TEXT | Ticket subject |
| message | TEXT | Ticket message |
| embedding | vector(768) | **Gemini Gecko** embedding (768-dim) |
| status | TEXT | open/pending/resolved/closed |
| priority | TEXT | low/medium/high/critical |
| category | TEXT | Ticket category |
| resolution | TEXT | Resolution description |
| metadata | JSONB | Custom metadata |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

### Functions
- **match_tickets()**: Finds similar tickets using cosine similarity

### Indexes
- `ivfflat` on `embedding` column for fast vector search
- B-tree indexes on `status`, `priority`, `category`, `created_at`

## Configuration

### Environment Variables

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_DB_URL=postgresql://postgres:your-password@localhost:5432/postgres
```

### Supabase Secrets

Set these in Supabase Dashboard → Project Settings → Secrets:
- `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/app/apikey))

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Link Project

```bash
supabase login
supabase link --project-ref your-project-ref
```

### 3. Apply Migration

```bash
supabase db push --db-url $SUPABASE_DB_URL
```

### 4. Deploy Functions

```bash
supabase functions deploy --project-ref $SUPABASE_PROJECT_REF
```

### 5. Test

```bash
supabase functions serve

curl -X POST http://localhost:54321/functions/v1/create-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"subject": "Test", "message": "Test message"}'
```

## RAG Context Format

The RAG context provided to AI agents:

```
--- Historical Ticket #1 (Similarity: 85.0%) ---
Subject: Previous login issue | Category: authentication
Priority: high
Status: resolved

Resolution: User needed to reset password

Message: I couldn't login to my account...

--- Historical Ticket #2 (Similarity: 78.5%) ---
...
```

## Optimization

- Uses `ivfflat` index with 100 lists
- Cosine similarity via `<=>` operator
- Minimum similarity threshold (default: 0.3)
- Efficient query building
- Singleton Supabase client pattern

## Security

- Service role key required for all operations
- CORS configured for Discord bot
- No public endpoints (all require auth)
- Secrets managed via Supabase Dashboard

## Monitoring

- **Supabase Dashboard**: View function logs, metrics, and errors
- **Database**: Monitor query performance
- **Analytics**: Track function invocations and latency

## Documentation

- [Full Deployment Guide](SUPABASE_DEPLOYMENT.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pgvector Extension](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Google Gemini Embeddings](https://ai.google.dev/docs/embedding)

---

**Built with love using Supabase Edge Functions, pgvector, and Google Gemini**
