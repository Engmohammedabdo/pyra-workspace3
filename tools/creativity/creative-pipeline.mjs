#!/usr/bin/env node
// Creative Pipeline Framework — Multi-model creative workflow
// Uses different AI models/temperatures for each stage of content creation

// ============================================================
// Pipeline Stage Definitions
// ============================================================

export const stages = {
  ideate: {
    description: 'Generate wild, creative ideas — quantity over quality',
    promptPrefix: 'You are a wildly creative brainstormer. Generate 10 diverse, unexpected ideas for:',
    temperature: 0.95,
    suggestedModel: 'gemini',
    emoji: '💡'
  },
  draft: {
    description: 'Write a structured first draft from the best ideas',
    promptPrefix: 'Write a professional, well-structured draft based on these ideas:',
    temperature: 0.7,
    suggestedModel: 'claude',
    emoji: '✍️'
  },
  critique: {
    description: 'Critically evaluate the draft — find weaknesses',
    promptPrefix: `You are a harsh but fair critic. Evaluate this content for: originality, clarity, persuasiveness, cultural fit (UAE/Dubai market), emotional impact. Score each 1-10 and explain:`,
    temperature: 0.3,
    suggestedModel: 'claude',
    emoji: '🔍'
  },
  humanize: {
    description: 'Remove AI patterns, add human soul',
    promptPrefix: `Rewrite this to sound completely human. Remove: overuse of "delve", "leverage", "furthermore", list addiction, hedging phrases ("It is worth noting"), filler transitions. Add: personality, imperfections, conversational flow, regional voice:`,
    temperature: 0.6,
    suggestedModel: 'claude',
    emoji: '🧠'
  },
  refine: {
    description: 'Final polish based on critique feedback',
    promptPrefix: 'Incorporate this feedback into the final version. Maintain the original voice while addressing each point:',
    temperature: 0.5,
    suggestedModel: 'claude',
    emoji: '✨'
  }
};

// ============================================================
// Pipeline Configurations for Content Types
// ============================================================

export const pipelines = {
  socialPost: {
    stages: ['ideate', 'draft', 'critique', 'humanize'],
    description: 'Social media post (Instagram/LinkedIn/Twitter)',
    emoji: '📱'
  },
  adCopy: {
    stages: ['ideate', 'draft', 'critique', 'refine', 'humanize'],
    description: 'Ad copy (Meta/Google)',
    emoji: '🎯'
  },
  blogPost: {
    stages: ['ideate', 'draft', 'critique', 'refine'],
    description: 'Blog article',
    emoji: '📝'
  },
  videoScript: {
    stages: ['ideate', 'draft', 'critique', 'refine'],
    description: 'Video script',
    emoji: '🎬'
  },
  emailCampaign: {
    stages: ['ideate', 'draft', 'critique', 'humanize'],
    description: 'Email marketing',
    emoji: '📧'
  },
  landingPage: {
    stages: ['ideate', 'draft', 'critique', 'refine', 'humanize'],
    description: 'Landing page copy',
    emoji: '🌐'
  },
  pressRelease: {
    stages: ['ideate', 'draft', 'critique', 'refine'],
    description: 'Press release / PR',
    emoji: '📰'
  }
};

// ============================================================
// Anti-AI Pattern Detection & Humanization
// ============================================================

export const aiPatterns = [
  // Overused words
  { pattern: /\bdelve\b/gi, replacement: 'explore', weight: 8 },
  { pattern: /\bleverage\b/gi, replacement: 'use', weight: 7 },
  { pattern: /\bfurthermore\b/gi, replacement: '', weight: 5 },
  { pattern: /\bmoreover\b/gi, replacement: '', weight: 4 },
  { pattern: /\bnevertheless\b/gi, replacement: 'still', weight: 4 },
  { pattern: /\bnotwithstanding\b/gi, replacement: '', weight: 6 },
  { pattern: /\bseamless(ly)?\b/gi, replacement: 'smooth$1', weight: 6 },
  { pattern: /\brobust\b/gi, replacement: 'strong', weight: 5 },
  { pattern: /\blandscape\b/gi, replacement: 'market', weight: 4 },
  { pattern: /\bholistic\b/gi, replacement: 'complete', weight: 5 },
  { pattern: /\bsynergy\b/gi, replacement: 'teamwork', weight: 6 },
  { pattern: /\bparadigm\b/gi, replacement: 'approach', weight: 5 },
  { pattern: /\bpivot\b/gi, replacement: 'shift', weight: 3 },
  { pattern: /\bcurated?\b/gi, replacement: 'selected', weight: 4 },
  { pattern: /\belevate\b/gi, replacement: 'improve', weight: 5 },
  { pattern: /\btapestry\b/gi, replacement: 'mix', weight: 7 },
  { pattern: /\bcommenc(e|ing)\b/gi, replacement: 'start$1', weight: 4 },
  { pattern: /\butiliz(e|ing)\b/gi, replacement: 'us$1', weight: 4 },
  { pattern: /\bfacilitat(e|ing)\b/gi, replacement: 'help$1', weight: 4 },

  // Hedging phrases
  { pattern: /\bit'?s worth noting (that )?/gi, replacement: '', weight: 7 },
  { pattern: /\bit'?s important to (note|remember|mention) (that )?/gi, replacement: '', weight: 6 },
  { pattern: /\bas (we all know|mentioned earlier),? ?/gi, replacement: '', weight: 5 },
  { pattern: /\bin (this|today'?s) (fast-paced|digital|modern|ever-changing|dynamic) /gi, replacement: 'in this ', weight: 7 },
  { pattern: /\bin conclusion,? ?/gi, replacement: '', weight: 5 },
  { pattern: /\bin the realm of /gi, replacement: 'in ', weight: 6 },
  { pattern: /\bwhen it comes to /gi, replacement: 'for ', weight: 3 },
  { pattern: /\bat the end of the day,? ?/gi, replacement: '', weight: 4 },

  // Cliché openers/closers
  { pattern: /\bgame.?changer\b/gi, replacement: 'breakthrough', weight: 7 },
  { pattern: /\bunlock (the |your )/gi, replacement: 'find $1', weight: 6 },
  { pattern: /\bempower(s|ing|ed)?\b/gi, replacement: 'help$1', weight: 5 },
  { pattern: /\btransformative\b/gi, replacement: 'major', weight: 5 },
  { pattern: /\bcutting.?edge\b/gi, replacement: 'advanced', weight: 4 },
  { pattern: /\bworld-?class\b/gi, replacement: 'top-tier', weight: 3 },
  { pattern: /\bstate.of.the.art\b/gi, replacement: 'modern', weight: 4 },
  { pattern: /\bbest-?in-?class\b/gi, replacement: 'leading', weight: 3 },

  // Structural AI patterns
  { pattern: /^(Sure|Absolutely|Great question)[!,.]?\s*/gm, replacement: '', weight: 8 },
  { pattern: /\bI hope (this|that) helps[.!]?\s*/gi, replacement: '', weight: 9 },
  { pattern: /\bLet me know if you (have|need) .+[.!]?\s*/gi, replacement: '', weight: 8 },
  { pattern: /\bHere'?s? (a |the )?(comprehensive |detailed )?(breakdown|overview|guide|look)( of| at)?:?\s*/gi, replacement: '', weight: 7 },
];

// Additional structural signals (not replaceable, just scored)
const structuralSignals = [
  { test: (t) => (t.match(/^\d+\.\s/gm) || []).length > 5, description: 'Excessive numbered lists', weight: 6 },
  { test: (t) => (t.match(/^[-•]\s/gm) || []).length > 8, description: 'Excessive bullet points', weight: 5 },
  { test: (t) => (t.match(/\*\*[^*]+\*\*/g) || []).length > 6, description: 'Overuse of bold text', weight: 4 },
  { test: (t) => (t.match(/^#{1,3}\s/gm) || []).length > 4, description: 'Too many headers', weight: 4 },
  { test: (t) => {
    const sentences = t.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length < 3) return false;
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    return variance < 8; // very uniform sentence lengths = AI
  }, description: 'Uniform sentence length (robotic rhythm)', weight: 6 },
  { test: (t) => /\b(firstly|secondly|thirdly|finally)\b/gi.test(t), description: 'Formal enumeration words', weight: 4 },
  { test: (t) => (t.match(/!\s/g) || []).length > 5, description: 'Excessive exclamation marks', weight: 3 },
];

/**
 * Detect how AI-sounding a text is (0-100)
 * @param {string} text
 * @returns {{ score: number, matches: Array<{pattern: string, count: number, weight: number}>, structural: string[] }}
 */
export function detectAIScore(text) {
  if (!text || text.trim().length === 0) return { score: 0, matches: [], structural: [] };

  let totalWeight = 0;
  const maxPossibleWeight = aiPatterns.reduce((s, p) => s + p.weight, 0) +
    structuralSignals.reduce((s, p) => s + p.weight, 0);

  const matches = [];
  for (const { pattern, weight } of aiPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const found = (text.match(regex) || []).length;
    if (found > 0) {
      totalWeight += Math.min(weight * found, weight * 3); // cap at 3x per pattern
      matches.push({
        pattern: pattern.source.replace(/\\b/g, '').slice(0, 40),
        count: found,
        weight
      });
    }
  }

  const structural = [];
  for (const { test, description, weight } of structuralSignals) {
    if (test(text)) {
      totalWeight += weight;
      structural.push(description);
    }
  }

  // Normalize to 0-100, with soft cap
  const rawScore = (totalWeight / Math.max(maxPossibleWeight * 0.25, 1)) * 100;
  const score = Math.min(100, Math.round(rawScore));

  return { score, matches, structural };
}

/**
 * Remove AI patterns from text
 * @param {string} text
 * @returns {{ cleaned: string, replacements: number }}
 */
export function humanize(text) {
  if (!text) return { cleaned: '', replacements: 0 };

  let cleaned = text;
  let replacements = 0;

  for (const { pattern, replacement } of aiPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const before = cleaned;
    cleaned = cleaned.replace(regex, replacement);
    if (cleaned !== before) replacements++;
  }

  // Clean up double spaces and empty lines left by removals
  cleaned = cleaned.replace(/  +/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/^\s+$/gm, '');
  cleaned = cleaned.trim();

  return { cleaned, replacements };
}

/**
 * Generate orchestration instructions for running a creative pipeline
 * @param {string} type - Pipeline type key (e.g., 'socialPost')
 * @param {string} topic - The topic/brief
 * @param {object} context - Additional context (audience, brand, tone, etc.)
 * @returns {{ steps: Array<object>, summary: string }}
 */
export function runPipeline(type, topic, context = {}) {
  const pipeline = pipelines[type];
  if (!pipeline) {
    const available = Object.keys(pipelines).join(', ');
    throw new Error(`Unknown pipeline "${type}". Available: ${available}`);
  }

  const { audience, brand, tone, platform, language } = context;

  const contextBlock = [
    audience && `Target audience: ${audience}`,
    brand && `Brand: ${brand}`,
    tone && `Tone: ${tone}`,
    platform && `Platform: ${platform}`,
    language && `Language: ${language}`,
  ].filter(Boolean).join('\n');

  const steps = pipeline.stages.map((stageName, i) => {
    const stage = stages[stageName];
    let prompt = stage.promptPrefix + '\n\n';

    if (i === 0) {
      // First stage gets the topic + context
      prompt += `Topic: ${topic}\n`;
      if (contextBlock) prompt += `\nContext:\n${contextBlock}\n`;
    } else {
      // Subsequent stages reference previous output
      prompt += `[Insert output from Stage ${i}: ${pipeline.stages[i - 1]}]\n`;
      if (stageName === 'refine') {
        prompt += `\n[Insert critique from critique stage]\n`;
      }
    }

    return {
      step: i + 1,
      stage: stageName,
      emoji: stage.emoji,
      description: stage.description,
      suggestedModel: stage.suggestedModel,
      temperature: stage.temperature,
      prompt: prompt.trim()
    };
  });

  const modelSummary = [...new Set(steps.map(s => s.suggestedModel))].join(' → ');
  const summary = `Pipeline: ${pipeline.emoji} ${pipeline.description}\n` +
    `Stages: ${steps.map(s => `${s.emoji} ${s.stage}`).join(' → ')}\n` +
    `Models: ${modelSummary}\n` +
    `Topic: ${topic}`;

  return { steps, summary, pipelineType: type, pipeline };
}

/**
 * List all available pipelines
 */
export function listPipelines() {
  const lines = ['📋 Available Creative Pipelines:\n'];
  for (const [key, p] of Object.entries(pipelines)) {
    const stageList = p.stages.map(s => `${stages[s].emoji} ${s}`).join(' → ');
    lines.push(`  ${p.emoji} ${key}`);
    lines.push(`     ${p.description}`);
    lines.push(`     Stages: ${stageList}`);
    lines.push('');
  }

  lines.push('📊 Available Stages:\n');
  for (const [key, s] of Object.entries(stages)) {
    lines.push(`  ${s.emoji} ${key} — ${s.description}`);
    lines.push(`     Model: ${s.suggestedModel} | Temp: ${s.temperature}`);
  }

  return lines.join('\n');
}

// ============================================================
// CLI
// ============================================================

function printUsage() {
  console.log(`
🎨 Creative Pipeline — Multi-Model Content Framework

Usage:
  node creative-pipeline.mjs list                    Show available pipelines & stages
  node creative-pipeline.mjs detect "text"           Score text for AI patterns (0-100)
  node creative-pipeline.mjs humanize "text"         Remove AI patterns from text
  node creative-pipeline.mjs plan <type> "topic"     Generate pipeline execution plan
    Options:
      --audience "..."   Target audience
      --brand "..."      Brand name
      --tone "..."       Desired tone
      --platform "..."   Platform (instagram, linkedin, etc.)

Examples:
  node creative-pipeline.mjs detect "Let's delve into the robust landscape of seamless solutions"
  node creative-pipeline.mjs humanize "Furthermore, it's worth noting that this game-changer leverages cutting-edge technology"
  node creative-pipeline.mjs plan socialPost "Ramadan campaign for luxury spa" --audience "UAE women 25-40"
`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
  process.exit(0);
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

switch (command) {
  case 'list': {
    console.log(listPipelines());
    break;
  }

  case 'detect': {
    const text = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    if (!text) { console.error('Usage: detect "text to analyze"'); process.exit(1); }
    const result = detectAIScore(text);
    console.log(`\n🤖 AI Detection Score: ${result.score}/100\n`);
    if (result.score < 20) console.log('✅ Sounds human!');
    else if (result.score < 40) console.log('⚠️ Some AI patterns detected');
    else if (result.score < 60) console.log('🟡 Moderately AI-sounding');
    else if (result.score < 80) console.log('🔴 Very AI-sounding');
    else console.log('💀 Pure AI slop');

    if (result.matches.length > 0) {
      console.log('\nPattern matches:');
      for (const m of result.matches.sort((a, b) => b.weight - a.weight)) {
        console.log(`  ⚡ "${m.pattern}" × ${m.count} (weight: ${m.weight})`);
      }
    }
    if (result.structural.length > 0) {
      console.log('\nStructural issues:');
      for (const s of result.structural) console.log(`  📐 ${s}`);
    }
    break;
  }

  case 'humanize': {
    const text = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    if (!text) { console.error('Usage: humanize "text to clean"'); process.exit(1); }
    const before = detectAIScore(text);
    const { cleaned, replacements } = humanize(text);
    const after = detectAIScore(cleaned);
    console.log(`\n🧠 Humanized (${replacements} replacements)\n`);
    console.log(`Before: AI score ${before.score}/100`);
    console.log(`After:  AI score ${after.score}/100\n`);
    console.log('─'.repeat(50));
    console.log(cleaned);
    console.log('─'.repeat(50));
    break;
  }

  case 'plan': {
    const type = args[1];
    const topicParts = [];
    const planArgs = args.slice(2);
    for (let i = 0; i < planArgs.length; i++) {
      if (planArgs[i].startsWith('--')) { i++; continue; }
      topicParts.push(planArgs[i]);
    }
    const topic = topicParts.join(' ');
    if (!type || !topic) {
      console.error('Usage: plan <pipelineType> "topic"');
      console.error('Types:', Object.keys(pipelines).join(', '));
      process.exit(1);
    }
    const flags = parseFlags(args.slice(2));
    try {
      const result = runPipeline(type, topic, flags);
      console.log(`\n${result.summary}\n`);
      console.log('═'.repeat(50));
      for (const step of result.steps) {
        console.log(`\n${step.emoji} Step ${step.step}: ${step.stage.toUpperCase()}`);
        console.log(`   Model: ${step.suggestedModel} | Temp: ${step.temperature}`);
        console.log(`   ${step.description}`);
        console.log(`\n   Prompt:\n   ${step.prompt.split('\n').join('\n   ')}`);
        console.log('─'.repeat(50));
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
