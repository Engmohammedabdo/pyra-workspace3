#!/usr/bin/env node

/**
 * Vision Auto-triggers — Automatic image classification and analysis routing.
 * 
 * Detects image type and applies the right analysis template automatically.
 * Builds on top of vision-pipeline.mjs for metadata and prompt generation.
 * 
 * Usage:
 *   node auto-triggers.mjs classify <image>
 *   node auto-triggers.mjs analyze <image>
 *   node auto-triggers.mjs compare <img1> <img2> [--type design|dashboard|general]
 *   node auto-triggers.mjs batch <folder|img1 img2 ...>
 *   node auto-triggers.mjs memory <image> <analysis-json>
 */

import { analyzeImage, getVisionPrompt, preprocessForAnalysis, fullPipeline } from './vision-pipeline.mjs';
import { readdir, stat, readFile } from 'fs/promises';
import { resolve, extname, join, basename } from 'path';
import { fileURLToPath } from 'url';

// ===== 1. Auto-Classify =====

/**
 * Automatically classify an image by type with confidence score.
 * Uses heuristics from vision-pipeline metadata + additional rules.
 * 
 * @param {string} imagePath
 * @returns {{ type: string, confidence: number, reasons: string[], suggestedTemplate: string, metadata: object }}
 */
export async function autoClassify(imagePath) {
  const meta = await analyzeImage(imagePath);
  const { width, height, format, hasAlpha } = meta.image;
  const fileSize = meta.file.sizeBytes;
  const ext = meta.file.extension;
  const entropy = meta.stats.entropy;
  const aspect = width / height;
  const baseType = meta.analysis.classification;
  const baseConfidence = meta.analysis.confidence;
  const reasons = [...meta.analysis.reasons];

  // Enhanced classification with additional rules
  let type = baseType;
  let confidence = baseConfidence;

  // Rule: 16:9 + high res → screenshot/dashboard
  if (aspect >= 1.7 && aspect <= 1.85 && width >= 1280) {
    type = 'screenshot';
    confidence = Math.max(confidence, 0.80);
    reasons.push('16:9 aspect ratio + high resolution → screenshot/dashboard');
  }

  // Rule: 9:16 tall narrow → mobile screenshot or social media
  if (aspect >= 0.5 && aspect <= 0.6 && height >= 1200) {
    type = 'mobile';
    confidence = Math.max(confidence, 0.75);
    reasons.push('9:16 tall narrow + tall → mobile screenshot or social media');
  }

  // Rule: alpha channel + widescreen → screenshot
  if (hasAlpha && aspect > 1.3) {
    if (type !== 'screenshot') {
      type = 'screenshot';
      confidence = Math.max(confidence, 0.70);
    }
    reasons.push('Alpha channel + widescreen → screenshot');
  }

  // Rule: JPEG + high entropy → photograph
  if ((ext === '.jpg' || ext === '.jpeg') && entropy > 7) {
    type = 'photo';
    confidence = Math.max(confidence, 0.80);
    reasons.push('JPEG + high entropy → photograph');
  }

  // Rule: PNG + low entropy → design/icon
  if (ext === '.png' && entropy < 4) {
    type = 'design';
    confidence = Math.max(confidence, 0.70);
    reasons.push('PNG + low entropy → design/icon');
  }

  // Rule: Small file + square → logo/icon
  if (fileSize < 100 * 1024 && Math.abs(aspect - 1) < 0.15) {
    type = 'icon';
    confidence = Math.max(confidence, 0.75);
    reasons.push('Small file (<100KB) + square → logo/icon');
  }

  // Rule: Large file + document-like aspect
  const a4Ratio = 210 / 297;
  const letterRatio = 8.5 / 11;
  if (fileSize > 500 * 1024 && (Math.abs(aspect - a4Ratio) < 0.08 || Math.abs(aspect - letterRatio) < 0.08)) {
    type = 'document';
    confidence = Math.max(confidence, 0.80);
    reasons.push('Large file + document-like aspect ratio → document/invoice');
  }

  // Map type to best template
  const templateMap = {
    screenshot: 'dashboard',
    mobile: 'social',
    photo: 'general',
    design: 'design',
    icon: 'design',
    document: 'document',
    chart: 'chart',
  };
  const suggestedTemplate = templateMap[type] || 'general';

  return {
    type,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    suggestedTemplate,
    metadata: {
      dimensions: `${width}x${height}`,
      aspectRatio: meta.analysis.aspectRatio,
      format: format,
      fileSize: meta.file.sizeHuman,
      hasAlpha,
      entropy: entropy != null ? Math.round(entropy * 100) / 100 : null,
    },
  };
}

// ===== 2. Auto-Analyze =====

/**
 * Classify → select template → preprocess → generate prompt.
 * Returns everything ready to feed to Claude vision API.
 * 
 * @param {string} imagePath
 * @param {object} [options] - { context, language, includeOCR }
 * @returns {{ type: string, template: string, prompt: string, preprocessedPath: string|null, classification: object, pipeline: object }}
 */
export async function autoAnalyze(imagePath, options = {}) {
  // Step 1: Classify
  const classification = await autoClassify(imagePath);

  // Step 2: Run full pipeline with suggested template
  const pipeline = await fullPipeline(imagePath, classification.suggestedTemplate, {
    context: options.context,
    language: options.language,
    includeOCR: options.includeOCR || classification.type === 'document',
    ocrLang: options.ocrLang,
  });

  return {
    type: classification.type,
    template: classification.suggestedTemplate,
    prompt: pipeline.prompt,
    preprocessedPath: null, // base64 available in pipeline
    classification,
    pipeline: {
      analysisType: pipeline.analysisType,
      preprocessed: pipeline.preprocessed,
      imageBase64: pipeline.imageBase64,
      imageMimeType: pipeline.imageMimeType,
      ocr: pipeline.ocr,
      ready: pipeline.ready,
    },
  };
}

// ===== 3. Compare Images =====

/**
 * Generate a structured comparison prompt for multiple images.
 * Supports A/B testing, before/after, time series analysis.
 * 
 * @param {string[]} imagePaths
 * @param {string} [type='general'] - 'design' | 'dashboard' | 'general'
 * @returns {{ prompt: string, images: object[], type: string }}
 */
export async function compareImages(imagePaths, type = 'general') {
  if (!imagePaths || imagePaths.length < 2) {
    throw new Error('compareImages requires at least 2 image paths');
  }

  // Classify all images
  const analyses = await Promise.all(imagePaths.map(async (p) => {
    const classification = await autoClassify(p);
    return { path: p, name: basename(p), classification };
  }));

  // Build comparison prompt based on type
  const prompts = {
    design: `# Design Comparison Analysis

You are reviewing ${analyses.length} design variations. For each image:

## Per-Image Analysis:
${analyses.map((a, i) => `### Image ${i + 1}: ${a.name}
- Detected type: ${a.classification.type} (${Math.round(a.classification.confidence * 100)}% confidence)
- Dimensions: ${a.classification.metadata.dimensions}`).join('\n')}

## Comparison Criteria:
1. **Visual Hierarchy** — Which design directs attention better?
2. **Color & Contrast** — Which palette is more effective?
3. **Typography** — Readability, font choices, text layout
4. **Whitespace** — Balance and breathing room
5. **CTA/Action Elements** — Which drives action more effectively?
6. **Overall Polish** — Consistency, alignment, professional feel

## Output:
- Rank the designs from best to worst with reasoning
- Identify specific strengths and weaknesses of each
- Recommend which to use and what to improve
- If A/B testing: predict which would convert better and why`,

    dashboard: `# Dashboard/Screenshot Comparison

Comparing ${analyses.length} screenshots. Analyze what changed between them.

## Images:
${analyses.map((a, i) => `### Image ${i + 1}: ${a.name}
- Type: ${a.classification.type}
- Size: ${a.classification.metadata.dimensions}`).join('\n')}

## Analysis Required:
1. **What Changed** — Identify every visible difference
2. **Data Changes** — Numbers, metrics, values that differ
3. **Layout Changes** — UI elements added, removed, or moved
4. **State Changes** — Status indicators, colors, alerts
5. **Time Context** — If timestamps visible, note the time range

## Output:
- List all changes as bullet points
- Categorize: data change, UI change, content change
- Assess if changes indicate progress, regression, or neutral shift
- Highlight any anomalies or concerning changes`,

    general: `# Image Comparison Analysis

Comparing ${analyses.length} images for similarities and differences.

## Images:
${analyses.map((a, i) => `### Image ${i + 1}: ${a.name}
- Detected type: ${a.classification.type} (${Math.round(a.classification.confidence * 100)}%)
- Dimensions: ${a.classification.metadata.dimensions}
- Format: ${a.classification.metadata.format}`).join('\n')}

## Comparison Points:
1. **Content** — What is shown in each image?
2. **Similarities** — What do they share?
3. **Differences** — What's unique to each?
4. **Quality** — Resolution, clarity, composition
5. **Context** — Relationship between the images (before/after, variations, etc.)

## Output:
- Side-by-side comparison summary
- Key findings
- Recommendation (if applicable)`,
  };

  const prompt = prompts[type] || prompts.general;

  return {
    prompt,
    images: analyses.map((a) => ({
      path: a.path,
      name: a.name,
      type: a.classification.type,
      confidence: a.classification.confidence,
    })),
    type,
  };
}

// ===== 4. Batch Analyze =====

/**
 * Process multiple images — auto-classify each.
 * Accepts a folder path or array of image paths.
 * 
 * @param {string[]} imagePaths - Array of paths or single folder path
 * @returns {Array<{ path: string, type: string, prompt: string, confidence: number, error?: string }>}
 */
export async function batchAnalyze(imagePaths) {
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif']);
  let paths = [];

  // If single path and it's a directory, scan it
  if (imagePaths.length === 1) {
    try {
      const s = await stat(imagePaths[0]);
      if (s.isDirectory()) {
        const files = await readdir(imagePaths[0]);
        paths = files
          .filter(f => imageExtensions.has(extname(f).toLowerCase()))
          .map(f => join(imagePaths[0], f));
      } else {
        paths = imagePaths;
      }
    } catch {
      paths = imagePaths;
    }
  } else {
    paths = imagePaths;
  }

  if (paths.length === 0) {
    throw new Error('No images found to analyze');
  }

  const results = [];
  for (const p of paths) {
    try {
      const classification = await autoClassify(p);
      const promptData = await getVisionPrompt(classification.suggestedTemplate);
      results.push({
        path: p,
        name: basename(p),
        type: classification.type,
        template: classification.suggestedTemplate,
        confidence: classification.confidence,
        prompt: promptData.prompt,
        metadata: classification.metadata,
      });
    } catch (e) {
      results.push({
        path: p,
        name: basename(p),
        type: 'error',
        template: null,
        confidence: 0,
        prompt: null,
        error: e.message,
      });
    }
  }

  return results;
}

// ===== 5. Image to Memory =====

/**
 * Extract key facts from vision analysis and format for memory ingestion.
 * 
 * @param {string} imagePath
 * @param {object} analysisResult - The result text/object from Claude vision API
 * @returns {{ content: string, type: string, tags: string, entities: string[] }}
 */
export async function imageToMemory(imagePath, analysisResult) {
  const classification = await autoClassify(imagePath);
  const name = basename(imagePath);

  // Normalize analysis to string
  const analysisText = typeof analysisResult === 'string'
    ? analysisResult
    : JSON.stringify(analysisResult, null, 2);

  // Build memory content
  const content = [
    `## Image Analysis: ${name}`,
    `**Type:** ${classification.type} (${Math.round(classification.confidence * 100)}% confidence)`,
    `**Dimensions:** ${classification.metadata.dimensions}`,
    `**Format:** ${classification.metadata.format} | **Size:** ${classification.metadata.fileSize}`,
    '',
    '### Analysis',
    analysisText,
  ].join('\n');

  // Extract tags from classification
  const tagSet = new Set(['image-analysis', classification.type]);
  if (classification.suggestedTemplate !== 'general') {
    tagSet.add(classification.suggestedTemplate);
  }
  // Add format as tag
  tagSet.add(classification.metadata.format);

  // Try to extract entity-like strings from analysis
  const entities = [];
  // Look for capitalized multi-word names (basic heuristic)
  const nameRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  const matches = analysisText.match(nameRegex);
  if (matches) {
    const unique = [...new Set(matches)].slice(0, 10);
    entities.push(...unique);
  }

  return {
    content,
    type: 'observation',
    tags: JSON.stringify([...tagSet]),
    entities,
    metadata: {
      imagePath: resolve(imagePath),
      imageType: classification.type,
      confidence: classification.confidence,
      dimensions: classification.metadata.dimensions,
    },
  };
}

// ===== CLI =====

async function cli() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];

  // Parse flags
  const flags = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  switch (command) {
    case 'classify': {
      if (positional.length === 0) {
        console.error('❌ Usage: auto-triggers.mjs classify <image>');
        process.exit(1);
      }
      const result = await autoClassify(positional[0]);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'analyze': {
      if (positional.length === 0) {
        console.error('❌ Usage: auto-triggers.mjs analyze <image>');
        process.exit(1);
      }
      const result = await autoAnalyze(positional[0], {
        context: flags.context,
        language: flags.language || flags.lang,
        includeOCR: flags.ocr === 'true',
      });
      // Print without base64
      const output = { ...result };
      if (output.pipeline) {
        delete output.pipeline.imageBase64;
        output.pipeline.base64Available = true;
      }
      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case 'compare': {
      if (positional.length < 2) {
        console.error('❌ Usage: auto-triggers.mjs compare <img1> <img2> [--type design|dashboard|general]');
        process.exit(1);
      }
      const type = flags.type || 'general';
      const result = await compareImages(positional, type);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'batch': {
      if (positional.length === 0) {
        console.error('❌ Usage: auto-triggers.mjs batch <folder|img1 img2 ...>');
        process.exit(1);
      }
      const results = await batchAnalyze(positional);
      // Strip long prompts for terminal display
      const summary = results.map(r => ({
        name: r.name,
        type: r.type,
        template: r.template,
        confidence: r.confidence,
        dimensions: r.metadata?.dimensions,
        error: r.error,
      }));
      console.log(JSON.stringify(summary, null, 2));
      break;
    }

    case 'memory': {
      if (positional.length < 2) {
        console.error('❌ Usage: auto-triggers.mjs memory <image> <analysis-text-or-json-file>');
        process.exit(1);
      }
      let analysis;
      try {
        analysis = await readFile(positional[1], 'utf-8');
      } catch {
        analysis = positional[1];
      }
      const result = await imageToMemory(positional[0], analysis);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
🎯 Vision Auto-triggers — Smart Image Classification & Analysis

Commands:
  classify <image>                   Auto-detect image type with confidence
  analyze <image>                    Full auto-analysis (classify → template → preprocess → prompt)
  compare <img1> <img2> [options]    Compare multiple images
  batch <folder|images...>           Batch-classify multiple images
  memory <image> <analysis>          Convert analysis result to memory object

Options:
  --type <type>       Compare type: design|dashboard|general
  --context <text>    Additional context for analysis
  --language <lang>   Response language
  --ocr true          Include OCR extraction

Examples:
  node auto-triggers.mjs classify screenshot.png
  node auto-triggers.mjs analyze invoice.pdf
  node auto-triggers.mjs compare old.png new.png --type dashboard
  node auto-triggers.mjs batch ./images/
  node auto-triggers.mjs memory photo.jpg "A sunset over the desert"
`);
}

// Run CLI if executed directly
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('auto-triggers.mjs')
);

if (isMain) {
  cli().catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  });
}
