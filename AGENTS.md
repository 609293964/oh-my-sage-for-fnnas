# AGENTS.md - oh-my-sage

## Project Overview

Xiaomi Mijia smart home AI Agent packaged as a Web/Native application:
- **Web App**: Next.js 14 + TypeScript + Ant Design + Vercel AI SDK
- **fnOS Native Package**: Next.js standalone server bundled into FPK layout

Communicates with Xiaomi gateway via WebSocket+ECJPAKE. Uses LLM tool-calling for smart home automation.

## Key Commands

```bash
# Web development
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run start            # Start production server

# fnOS packaging
npm run prepare:fpk      # Copy standalone build into fnOS package layout
npm run build:fpk        # Build Next.js, prepare package, then run fnpack

# Quality checks
npm run lint             # ESLint (next/core-web-vitals)
npx tsc --noEmit         # TypeScript strict mode check

# Testing (manual only, no automated framework)
npm run test             # Runs npx tsx src/test.ts
npx tsx <script.ts>      # Run single TypeScript file
```

**Note**: No Jest/Vitest. All tests are manual integration tests via `tsx`.

## Architecture

- `src/app/` - Next.js App Router, API routes, pages
- `src/components/` - React UI (Chat, DevicePanel, etc.)
- `src/server/` - Backend: AI/LLM integration, Agent core, Gateway shared singleton, Session store
- `src/core/` - Web backend core library: gateway client, tool implementations, types
- `.agents/skills/` - Runtime skills loaded by the Web Agent
- `fnnas.oh-my-sage/` - fnOS Native package layout

## Skill System

Progressive disclosure in `.agents/skills/`:
- Layer 1: Catalog (name + description, ~50 tokens)
- Layer 2: Instructions (full SKILL.md via `activate_skill` tool)
- Layer 3: Resources (files in `references/` via `read_skill_file` tool)

**Critical skill**: `mijia-automation` - Required for creating automation rules. Located at `.agents/skills/mijia-automation/SKILL.md`.

## Code Conventions

### Imports
```typescript
// External libs first, then internal
import {streamText} from 'ai';
import {z} from 'zod';
import {GatewayClient} from '@/core/gateway/client';
```

### TypeScript
- Strict mode enabled - handle nulls explicitly
- Prefer `interface` over `type` for objects
- Explicit return types on exported functions
- `any` acceptable for gateway API responses (pragmatic)

### Tool Definitions
- Use `zod` schemas with `.describe()` for LLM-facing tools
- Tools return `{ success: boolean, ... }` - **never throw**
- Wrap gateway calls in try/catch, return `{ success: false, error: string }`

### API Routes
- Use `export const runtime = 'nodejs'`
- Use `export const dynamic = 'force-dynamic'` for stateful/runtime API routes
- SSE format: `data: ...\n\n`, end with `data: [DONE]\n\n`

### Naming
- Files: camelCase for utils, kebab-case for components
- Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- Tool names: snake_case strings

## State Management

- **No Redux/Zustand on server**
- Gateway: shared singleton via `server/gateway/shared.ts`
- Session: JSON file-based store (`server/session/store.ts`)
- Client: React hooks with prop drilling

## Environment

Copy `.env.example` to `.env`:
```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_key
LLM_MODEL=gpt-4o
GATEWAY_URL=http://192.168.0.5
```

For fnOS builds, these values are configured by `wizard/install` and `wizard/config`, then written to `${TRIM_PKGETC}/oh-my-sage.env`.

## Comments

Chinese comments are used throughout - match existing style.
Use section dividers: `// ==================== Section Name ====================`
