# 🎨 Creativity Toolkit — Pyramedia

Creative prompt templates and frameworks for Pyramedia's marketing work in Dubai/UAE.

## Quick Start

```bash
cd /home/node/openclaw/tools/creativity

# List all templates
node prompt-templates.mjs list

# Use a specific template
node prompt-templates.mjs use socialMedia --topic "Dubai Food Festival" --platform instagram --tone fun

# Get a random template for inspiration
node prompt-templates.mjs random
```

## Available Templates

| Template | Purpose | Key Args |
|----------|---------|----------|
| `socialMedia` | Social media posts (5 variations) | `--topic`, `--platform`, `--tone` |
| `brainstorm` | SCAMPER brainstorming | `--problem` |
| `adCopy` | Ad copy (PAS/AIDA/BAB) | `--product`, `--audience`, `--framework` |
| `videoScript` | Video scripts with production notes | `--topic`, `--duration`, `--style` |
| `emailSequence` | 5-email sequences | `--business`, `--goal` |
| `storyBrand` | Donald Miller's SB7 framework | `--brand` |
| `reframe` | Problem reframing (5 angles) | `--problem` |

## Platforms (socialMedia)

- `instagram` — Visual-first, carousel ideas, story polls
- `tiktok` — Trendy, hook-first, short format
- `linkedin` — Professional, minimal emoji
- `twitter` — Short, thread potential

## Ad Frameworks (adCopy)

- `PAS` — Problem → Agitate → Solution
- `AIDA` — Attention → Interest → Desire → Action
- `BAB` — Before → After → Bridge
- `all` — All three (default)

## Video Styles (videoScript)

- `educational` — Facts, how-to, tips
- `storytelling` — Narrative, case study
- `hype` — Energetic, promotional

## Usage as ESM Module

```javascript
import { templates } from './prompt-templates.mjs';

// Generate a prompt
const prompt = templates.socialMedia.template('Dubai Food Festival', 'instagram', 'fun');
// Feed this prompt to any AI model (Claude, GPT, Gemini...)
```

## SOUL.md Integration

The Creativity Toolkit section in SOUL.md includes:
- **SCAMPER** — Improve existing ideas
- **Six Thinking Hats** — Multi-angle analysis
- **Chain-of-Creativity** — Content creation flow
- **قواعد الإبداع** — Always 3+ options, think out loud, cross-domain connections

## 🇦🇪 UAE Market Notes

All templates are designed for:
- Mixed audience (مواطنين + مقيمين + expats)
- Bilingual content (عربي + English)
- UAE seasons (Ramadan, National Day, DSF, summer indoor)
- Prices in AED
- Gulf dialect or simple فصحى
