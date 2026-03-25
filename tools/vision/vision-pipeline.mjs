#!/usr/bin/env node

/**
 * Vision Pipeline — Image Analysis Tool + Structured Output
 * 
 * Pre-processes images and provides structured prompts for Claude vision analysis.
 * Works as both a CLI tool and an importable ESM module.
 * 
 * Usage:
 *   node vision-pipeline.mjs metadata <image>
 *   node vision-pipeline.mjs preprocess <image> [--type screenshot|document|photo|design] [--output path]
 *   node vision-pipeline.mjs analyze <image> [--type dashboard|design|document|social|chart|general]
 *   node vision-pipeline.mjs ocr <image> [--lang eng+ara]
 */

import { readFile, stat, writeFile } from 'fs/promises';
import { basename, extname, resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== Lazy imports with graceful fallback =====
let sharp, Tesseract;

async function loadSharp() {
  if (sharp) return sharp;
  try {
    sharp = (await import('sharp')).default;
    return sharp;
  } catch (e) {
    console.error('⚠️  sharp not available. Install with: npm install sharp');
    console.error(`   Error: ${e.message}`);
    return null;
  }
}

async function loadTesseract() {
  if (Tesseract) return Tesseract;
  try {
    Tesseract = await import('tesseract.js');
    return Tesseract;
  } catch (e) {
    console.error('⚠️  tesseract.js not available. Install with: npm install tesseract.js');
    console.error(`   Error: ${e.message}`);
    return null;
  }
}

// ===== Load templates =====
let _templates = null;

async function loadTemplates() {
  if (_templates) return _templates;
  try {
    const raw = await readFile(join(__dirname, 'vision-templates.json'), 'utf-8');
    _templates = JSON.parse(raw);
    return _templates;
  } catch (e) {
    console.error(`⚠️  Could not load vision-templates.json: ${e.message}`);
    return null;
  }
}

// ===== 1. Image Metadata & Analysis =====

/**
 * Analyze image and return metadata + classification hints.
 * @param {string} imagePath - Path to the image file
 * @returns {object} metadata including dimensions, format, size, classification
 */
export async function analyzeImage(imagePath) {
  const sharpLib = await loadSharp();
  if (!sharpLib) throw new Error('sharp is required for image analysis');

  const filePath = resolve(imagePath);
  const fileStat = await stat(filePath);
  const image = sharpLib(filePath);
  const metadata = await image.metadata();
  const stats = await image.stats();

  // Classify image type based on heuristics
  const classification = classifyImage(metadata, stats, fileStat);

  // Extract dominant colors from channel stats
  const dominantColors = extractDominantColors(stats);

  return {
    file: {
      path: filePath,
      name: basename(filePath),
      extension: extname(filePath).toLowerCase(),
      sizeBytes: fileStat.size,
      sizeHuman: humanFileSize(fileStat.size),
    },
    image: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      isProgressive: metadata.isProgressive,
      orientation: metadata.orientation,
    },
    analysis: {
      classification: classification.type,
      confidence: classification.confidence,
      reasons: classification.reasons,
      aspectRatio: getAspectRatio(metadata.width, metadata.height),
      megapixels: ((metadata.width * metadata.height) / 1000000).toFixed(2),
      dominantColors,
      isLargeForAPI: fileStat.size > 2 * 1024 * 1024,
      recommendedPreprocess: classification.recommendedPreprocess,
    },
    stats: {
      channels: stats.channels.map((ch, i) => ({
        channel: ['red', 'green', 'blue', 'alpha'][i] || `ch${i}`,
        min: ch.min,
        max: ch.max,
        mean: Math.round(ch.mean * 100) / 100,
        stdev: Math.round(ch.stdev * 100) / 100,
      })),
      isOpaque: stats.isOpaque,
      entropy: stats.entropy,
    },
  };
}

function classifyImage(metadata, stats, fileStat) {
  const reasons = [];
  let scores = { screenshot: 0, document: 0, photo: 0, design: 0, chart: 0 };

  const { width, height } = metadata;
  const aspect = width / height;

  // Common screen resolutions suggest screenshot
  const screenWidths = [1280, 1366, 1440, 1536, 1920, 2560, 3840, 750, 1080, 1170, 1284, 1290];
  if (screenWidths.some(w => Math.abs(width - w) < 10)) {
    scores.screenshot += 3;
    reasons.push('Width matches common screen resolution');
  }

  // Very wide aspect ratios suggest screenshots/dashboards
  if (aspect > 1.5 && aspect < 2.0) {
    scores.screenshot += 2;
    scores.chart += 1;
    reasons.push('Widescreen aspect ratio');
  }

  // Tall narrow images suggest mobile screenshots or documents
  if (aspect < 0.6) {
    scores.screenshot += 1;
    scores.document += 2;
    reasons.push('Tall narrow format (mobile/document)');
  }

  // Standard paper ratios suggest documents
  const a4Ratio = 210 / 297;
  const letterRatio = 8.5 / 11;
  if (Math.abs(aspect - a4Ratio) < 0.05 || Math.abs(aspect - letterRatio) < 0.05) {
    scores.document += 4;
    reasons.push('Aspect ratio matches paper size');
  }

  // High DPI suggests scanned document
  if (metadata.density && metadata.density >= 200) {
    scores.document += 2;
    reasons.push(`High DPI (${metadata.density})`);
  }

  // PNG with alpha often means design
  if (metadata.hasAlpha && metadata.format === 'png') {
    scores.design += 2;
    reasons.push('PNG with alpha channel');
  }

  // Low color variance might mean document/screenshot
  const channelStats = stats.channels;
  if (channelStats.length >= 3) {
    const avgStdev = (channelStats[0].stdev + channelStats[1].stdev + channelStats[2].stdev) / 3;
    if (avgStdev < 40) {
      scores.document += 2;
      scores.screenshot += 1;
      reasons.push('Low color variance (text-heavy content likely)');
    }
    if (avgStdev > 60) {
      scores.photo += 2;
      reasons.push('High color variance (photographic content likely)');
    }
  }

  // Large file size with JPEG suggests photo
  if (metadata.format === 'jpeg' && fileStat.size > 500000) {
    scores.photo += 2;
    reasons.push('Large JPEG file');
  }

  // Find the winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [type, score] = sorted[0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? Math.min(0.95, score / total) : 0.2;

  const preprocessMap = {
    screenshot: 'screenshot',
    document: 'document',
    photo: 'photo',
    design: 'design',
    chart: 'screenshot',
  };

  return {
    type,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    recommendedPreprocess: preprocessMap[type] || 'photo',
  };
}

function extractDominantColors(stats) {
  if (!stats.channels || stats.channels.length < 3) return [];
  const r = Math.round(stats.channels[0].mean);
  const g = Math.round(stats.channels[1].mean);
  const b = Math.round(stats.channels[2].mean);
  return [
    {
      name: 'average',
      rgb: `rgb(${r}, ${g}, ${b})`,
      hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
    },
  ];
}

function getAspectRatio(w, h) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function humanFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}


// ===== 2. Image Pre-processing =====

/**
 * Pre-process image for optimal vision API analysis.
 * @param {string} imagePath 
 * @param {string} type - 'screenshot' | 'document' | 'photo' | 'design'
 * @param {object} options - { output, maxWidth, maxHeight, quality }
 * @returns {object} { buffer, outputPath, originalSize, processedSize, operations }
 */
export async function preprocessForAnalysis(imagePath, type = 'auto', options = {}) {
  const sharpLib = await loadSharp();
  if (!sharpLib) throw new Error('sharp is required for preprocessing');

  const filePath = resolve(imagePath);
  
  // Auto-detect type if needed
  if (type === 'auto') {
    const meta = await analyzeImage(filePath);
    type = meta.analysis.recommendedPreprocess;
  }

  // Load profile from templates
  const templates = await loadTemplates();
  const profile = templates?.preprocessingProfiles?.[type] || templates?.preprocessingProfiles?.photo;

  const maxWidth = options.maxWidth || profile?.maxWidth || 2048;
  const maxHeight = options.maxHeight || profile?.maxHeight || 2048;
  const quality = options.quality || profile?.quality || 90;
  const format = profile?.format || 'png';

  let image = sharpLib(filePath);
  const originalMeta = await image.metadata();
  const originalStat = await stat(filePath);
  const operations = [];

  // Resize if exceeds max dimensions
  if (originalMeta.width > maxWidth || originalMeta.height > maxHeight) {
    image = image.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true });
    operations.push(`resize to fit ${maxWidth}x${maxHeight}`);
  }

  // Type-specific processing
  switch (type) {
    case 'screenshot':
      image = image
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 0.5 })
        .normalize();
      operations.push('sharpen (text clarity)', 'normalize (enhance contrast)');
      break;

    case 'document':
      image = image
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
        .threshold(0, { greyscale: false }); // auto threshold
      // Actually, let's use linear for better doc processing
      image = sharpLib(filePath);
      if (originalMeta.width > maxWidth || originalMeta.height > maxHeight) {
        image = image.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true });
      }
      image = image
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .linear(1.2, -30); // increase contrast
      operations.length = 0;
      if (originalMeta.width > maxWidth || originalMeta.height > maxHeight) {
        operations.push(`resize to fit ${maxWidth}x${maxHeight}`);
      }
      operations.push('grayscale', 'normalize', 'sharpen (OCR optimized)', 'high contrast');
      break;

    case 'photo':
      image = image.normalize();
      operations.push('normalize (auto-level)');
      break;

    case 'design':
      // Minimal processing — preserve colors
      operations.push('resize only (colors preserved)');
      break;
  }

  // Output format
  let buffer;
  if (format === 'png') {
    buffer = await image.png({ quality }).toBuffer();
  } else {
    buffer = await image.jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  // If still over 2MB, progressively reduce quality
  let currentQuality = quality;
  while (buffer.length > 2 * 1024 * 1024 && currentQuality > 30) {
    currentQuality -= 10;
    operations.push(`reduce quality to ${currentQuality}`);
    if (format === 'png') {
      // Switch to JPEG for size reduction
      buffer = await image.jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();
    } else {
      buffer = await image.jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();
    }
  }

  // Save if output path provided
  const outputPath = options.output || null;
  if (outputPath) {
    await writeFile(resolve(outputPath), buffer);
  }

  return {
    buffer,
    outputPath,
    originalSize: humanFileSize(originalStat.size),
    processedSize: humanFileSize(buffer.length),
    originalDimensions: `${originalMeta.width}x${originalMeta.height}`,
    processType: type,
    operations,
    format: buffer.length < originalStat.size * 0.8 && format === 'png' ? 'jpeg' : format,
    base64: buffer.toString('base64'),
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
  };
}


// ===== 3. Structured Vision Prompts =====

/**
 * Get a structured vision prompt for a specific analysis type.
 * @param {string} type - Template type name
 * @param {object} options - { context, language, focusAreas }
 * @returns {object} { prompt, outputFormat, fields, preprocessType }
 */
export async function getVisionPrompt(type = 'general', options = {}) {
  const templates = await loadTemplates();
  if (!templates) throw new Error('Could not load vision templates');

  const template = templates.templates[type];
  if (!template) {
    const available = Object.keys(templates.templates).join(', ');
    throw new Error(`Unknown template type: "${type}". Available: ${available}`);
  }

  let prompt = template.prompt;

  // Add context if provided
  if (options.context) {
    prompt += `\n\n## Additional Context:\n${options.context}`;
  }

  // Add language instruction
  if (options.language) {
    prompt += `\n\n## Language:\nRespond in ${options.language}.`;
  }

  // Add focus areas
  if (options.focusAreas && Array.isArray(options.focusAreas)) {
    prompt += `\n\n## Focus Areas:\nPay special attention to: ${options.focusAreas.join(', ')}`;
  }

  // Add custom instructions
  if (options.customInstructions) {
    prompt += `\n\n## Custom Instructions:\n${options.customInstructions}`;
  }

  return {
    name: template.name,
    prompt,
    outputFormat: template.outputFormat,
    fields: template.fields,
    preprocessType: template.preprocessType,
  };
}

/**
 * List all available template types.
 */
export async function listTemplates() {
  const templates = await loadTemplates();
  if (!templates) return [];
  return Object.entries(templates.templates).map(([key, val]) => ({
    key,
    name: val.name,
    description: val.description,
    outputFormat: val.outputFormat,
    fieldCount: val.fields.length,
  }));
}


// ===== 4. OCR =====

/**
 * Perform OCR on an image using tesseract.js
 * @param {string} imagePath 
 * @param {string} lang - Language(s), e.g. 'eng', 'ara', 'eng+ara'
 * @returns {object} { text, confidence, blocks, languages }
 */
export async function performOCR(imagePath, lang = 'eng') {
  const tess = await loadTesseract();
  if (!tess) throw new Error('tesseract.js is required for OCR');

  const filePath = resolve(imagePath);
  
  // Preprocess for OCR
  let inputPath = filePath;
  try {
    const preprocessed = await preprocessForAnalysis(filePath, 'document', {
      output: filePath + '.ocr-preprocessed.png',
    });
    inputPath = filePath + '.ocr-preprocessed.png';
  } catch (e) {
    // Fall back to original if preprocessing fails
    console.error(`⚠️  Preprocessing failed, using original: ${e.message}`);
  }

  console.log(`🔍 Running OCR (language: ${lang})...`);
  
  const worker = await tess.createWorker(lang);
  const result = await worker.recognize(inputPath);
  await worker.terminate();

  // Clean up preprocessed file
  try {
    const { unlink } = await import('fs/promises');
    await unlink(filePath + '.ocr-preprocessed.png').catch(() => {});
  } catch {}

  return {
    text: result.data.text,
    confidence: result.data.confidence,
    blocks: result.data.blocks?.map(b => ({
      text: b.text,
      confidence: b.confidence,
      bbox: b.bbox,
    })) || [],
    lines: result.data.lines?.map(l => ({
      text: l.text,
      confidence: l.confidence,
    })) || [],
    words: result.data.words?.length || 0,
    languages: lang.split('+'),
  };
}


// ===== 5. Full Analysis Pipeline =====

/**
 * Run the complete analysis pipeline: metadata → preprocess → prompt generation.
 * Returns everything needed to send to Claude vision API.
 * 
 * @param {string} imagePath 
 * @param {string} type - Analysis type (dashboard, design, document, etc.)
 * @param {object} options - { context, language, includeOCR, ocrLang }
 * @returns {object} Complete analysis package
 */
export async function fullPipeline(imagePath, type = 'auto', options = {}) {
  // Step 1: Analyze image
  const metadata = await analyzeImage(imagePath);
  
  // Auto-detect analysis type if needed
  if (type === 'auto') {
    type = inferAnalysisType(metadata);
  }

  // Step 2: Get prompt
  const promptData = await getVisionPrompt(type, options);

  // Step 3: Preprocess
  const preprocessed = await preprocessForAnalysis(
    imagePath, 
    promptData.preprocessType || 'auto'
  );

  // Step 4: OCR if requested or if document type
  let ocrResult = null;
  if (options.includeOCR || type === 'document') {
    try {
      ocrResult = await performOCR(imagePath, options.ocrLang || 'eng');
    } catch (e) {
      ocrResult = { error: e.message };
    }
  }

  // Enhance prompt with OCR context if available
  let finalPrompt = promptData.prompt;
  if (ocrResult && ocrResult.text && ocrResult.text.trim()) {
    finalPrompt += `\n\n## OCR Pre-extraction (for reference):\nThe following text was pre-extracted via OCR (confidence: ${ocrResult.confidence}%):\n\`\`\`\n${ocrResult.text.trim()}\n\`\`\`\nUse this as a reference but verify against the actual image.`;
  }

  return {
    metadata,
    analysisType: type,
    prompt: finalPrompt,
    promptMetadata: {
      name: promptData.name,
      outputFormat: promptData.outputFormat,
      fields: promptData.fields,
    },
    preprocessed: {
      processType: preprocessed.processType,
      originalSize: preprocessed.originalSize,
      processedSize: preprocessed.processedSize,
      originalDimensions: preprocessed.originalDimensions,
      operations: preprocessed.operations,
      mimeType: preprocessed.mimeType,
      base64Length: preprocessed.base64.length,
    },
    imageBase64: preprocessed.base64,
    imageMimeType: preprocessed.mimeType,
    ocr: ocrResult,
    ready: true,
  };
}

function inferAnalysisType(metadata) {
  const { classification } = metadata.analysis;
  const typeMap = {
    screenshot: 'dashboard', // screenshots are often dashboards
    document: 'document',
    photo: 'general',
    design: 'design',
    chart: 'chart',
  };
  return typeMap[classification] || 'general';
}


// ===== CLI =====

async function cli() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];
  const imagePath = args[1];

  // Parse flags
  const flags = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i++;
    }
  }

  switch (command) {
    case 'metadata':
    case 'meta': {
      if (!imagePath) { console.error('❌ Usage: vision-pipeline.mjs metadata <image>'); process.exit(1); }
      const result = await analyzeImage(imagePath);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'preprocess':
    case 'pre': {
      if (!imagePath) { console.error('❌ Usage: vision-pipeline.mjs preprocess <image> [--type TYPE] [--output PATH]'); process.exit(1); }
      const type = flags.type || 'auto';
      const output = flags.output || imagePath.replace(/(\.[^.]+)$/, `.processed$1`);
      const result = await preprocessForAnalysis(imagePath, type, { output });
      console.log(JSON.stringify({
        processType: result.processType,
        originalSize: result.originalSize,
        processedSize: result.processedSize,
        originalDimensions: result.originalDimensions,
        operations: result.operations,
        outputPath: resolve(output),
      }, null, 2));
      break;
    }

    case 'analyze':
    case 'prompt': {
      if (!imagePath) { console.error('❌ Usage: vision-pipeline.mjs analyze <image> [--type TYPE]'); process.exit(1); }
      const type = flags.type || 'auto';
      const result = await fullPipeline(imagePath, type, {
        context: flags.context,
        language: flags.language || flags.lang,
        includeOCR: flags.ocr === 'true' || flags.ocr === true,
        ocrLang: flags['ocr-lang'] || 'eng',
      });
      // Print without the base64 to avoid flooding terminal
      const output = { ...result };
      delete output.imageBase64;
      output.preprocessed.base64Available = true;
      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case 'ocr': {
      if (!imagePath) { console.error('❌ Usage: vision-pipeline.mjs ocr <image> [--lang eng+ara]'); process.exit(1); }
      const lang = flags.lang || flags.language || 'eng';
      const result = await performOCR(imagePath, lang);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'templates':
    case 'list': {
      const templates = await listTemplates();
      console.log('\n📋 Available Vision Templates:\n');
      for (const t of templates) {
        console.log(`  ${t.key.padEnd(16)} ${t.name} (${t.outputFormat}, ${t.fieldCount} fields)`);
        console.log(`  ${''.padEnd(16)} ${t.description}\n`);
      }
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
🔬 Vision Pipeline — Image Analysis Tool

Commands:
  metadata <image>                          Get image metadata and classification
  preprocess <image> [options]              Pre-process image for API
  analyze <image> [options]                 Full analysis pipeline (metadata + preprocess + prompt)
  ocr <image> [options]                     Extract text via OCR
  templates                                 List available analysis templates

Options:
  --type <type>       Analysis type: dashboard|design|document|social|chart|general|comparison|product|arabic_content
  --output <path>     Output path for preprocessed image
  --lang <lang>       OCR language (default: eng, e.g. eng+ara)
  --context <text>    Additional context for the prompt
  --language <lang>   Response language
  --ocr true          Include OCR in analysis pipeline

Examples:
  node vision-pipeline.mjs metadata screenshot.png
  node vision-pipeline.mjs preprocess invoice.pdf --type document --output clean.png
  node vision-pipeline.mjs analyze dashboard.png --type dashboard
  node vision-pipeline.mjs ocr arabic-doc.jpg --lang ara+eng
  node vision-pipeline.mjs templates
`);
}

// Run CLI if executed directly
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('vision-pipeline.mjs')
);

if (isMain) {
  cli().catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  });
}
