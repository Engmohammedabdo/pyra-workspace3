# Vision Pipeline 🔬

Image analysis tool with pre-processing and structured prompts for Claude vision API.

## Quick Start

```bash
# Get image metadata + auto-classification
node tools/vision/vision-pipeline.mjs metadata image.png

# Pre-process for optimal API analysis
node tools/vision/vision-pipeline.mjs preprocess image.png --type document --output clean.png

# Full analysis pipeline (metadata + preprocess + structured prompt)
node tools/vision/vision-pipeline.mjs analyze dashboard.png --type dashboard

# OCR text extraction
node tools/vision/vision-pipeline.mjs ocr invoice.jpg --lang eng+ara

# List all templates
node tools/vision/vision-pipeline.mjs templates
```

## Commands

### `metadata <image>`
Returns image metadata, classification, and analysis:
- Dimensions, format, file size, color space
- Auto-classification: screenshot / document / photo / design / chart
- Dominant colors, aspect ratio, megapixels
- Recommended preprocessing type

### `preprocess <image> [--type TYPE] [--output PATH]`
Optimizes image for vision API:
- **screenshot**: sharpen text, normalize contrast
- **document**: grayscale, high contrast, denoise, OCR-optimized
- **photo**: auto-level, resize if too large
- **design**: preserve colors, minimal processing
- **auto**: auto-detect and apply best profile

Always ensures output is under 2MB with reasonable dimensions.

### `analyze <image> [--type TYPE]`
Full pipeline — returns everything needed for Claude vision:
- Image metadata & classification
- Pre-processed image (base64)
- Structured prompt for the analysis type
- OCR pre-extraction (for document type)

### `ocr <image> [--lang LANG]`
Tesseract.js OCR with document pre-processing:
- Default language: `eng`
- Arabic: `--lang ara`
- Multi-language: `--lang eng+ara`
- Returns: text, confidence, word count, block-level data

## Analysis Templates

| Type | Use Case | Output |
|------|----------|--------|
| `dashboard` | Analytics screenshots, reporting UIs | JSON |
| `design` | Creatives, designs, visual assets | Text with /10 score |
| `document` | Invoices, contracts, documents | JSON |
| `social` | Social media posts, ads | Text with /10 score |
| `comparison` | A/B tests, before/after | Text with scoring table |
| `chart` | Charts, graphs, data viz | JSON |
| `general` | Any image | Text |
| `product` | E-commerce product photos | Text with /10 score |
| `arabic_content` | Arabic text/content (UAE/GCC) | Bilingual (AR+EN) |

## As a Module

```javascript
import {
  analyzeImage,
  preprocessForAnalysis,
  getVisionPrompt,
  performOCR,
  fullPipeline,
  listTemplates,
} from './tools/vision/vision-pipeline.mjs';

// Get metadata
const meta = await analyzeImage('image.png');

// Preprocess
const processed = await preprocessForAnalysis('image.png', 'screenshot');
// processed.base64 — ready for API

// Get prompt
const { prompt, outputFormat } = await getVisionPrompt('dashboard', {
  context: 'This is a Meta Ads dashboard',
  language: 'Arabic',
});

// Full pipeline
const result = await fullPipeline('dashboard.png', 'dashboard');
// result.imageBase64 — preprocessed image
// result.prompt — structured prompt
// result.metadata — image info
// result.ocr — extracted text (if document type)

// OCR
const ocr = await performOCR('document.jpg', 'eng+ara');
console.log(ocr.text);
```

## Files

- `vision-pipeline.mjs` — Main tool (CLI + module)
- `vision-templates.json` — Prompt templates (editable)
- `README.md` — This file

## Dependencies

- **sharp** — Image processing (resize, sharpen, normalize, etc.)
- **tesseract.js** — OCR text extraction

Both use lazy loading with graceful fallback if not installed.

## Customizing Templates

Edit `vision-templates.json` to customize prompts. Each template has:
- `name` — Display name
- `description` — What it's for
- `prompt` — The detailed prompt sent to Claude
- `outputFormat` — Expected output (json/text)
- `fields` — Expected output fields
- `preprocessType` — Image preprocessing profile to use
