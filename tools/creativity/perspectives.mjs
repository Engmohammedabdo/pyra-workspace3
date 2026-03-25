#!/usr/bin/env node
// Automated Perspective Generator — Six Thinking Hats, Personas, SCAMPER
// Generates diverse perspectives and content angles for any topic

// ============================================================
// Perspective Methods
// ============================================================

const methods = {
  sixhats: {
    name: 'Six Thinking Hats',
    description: 'Edward de Bono\'s parallel thinking method',
    emoji: '🎩',
    perspectives: [
      {
        name: 'White Hat — Facts & Data',
        emoji: '⬜',
        color: 'white',
        promptPrefix: 'Analyze this ONLY with facts, data, and evidence. No opinions. What do we know? What data do we need? What are the numbers?',
        focus: 'Information, data, facts, gaps in knowledge'
      },
      {
        name: 'Red Hat — Emotions & Intuition',
        emoji: '🟥',
        color: 'red',
        promptPrefix: 'React purely from emotion and gut feeling. No justification needed. How does this make you FEEL? What\'s your instinct? What would the emotional reaction be?',
        focus: 'Feelings, hunches, intuition, emotional reactions'
      },
      {
        name: 'Black Hat — Risks & Caution',
        emoji: '⬛',
        color: 'black',
        promptPrefix: 'Be the devil\'s advocate. What could go WRONG? What are the risks, dangers, and weaknesses? Why might this fail? Be critical but logical.',
        focus: 'Dangers, risks, difficulties, problems, caution'
      },
      {
        name: 'Yellow Hat — Benefits & Optimism',
        emoji: '🟨',
        color: 'yellow',
        promptPrefix: 'Focus ONLY on the positives. What\'s the best case scenario? What value does this create? Why will this succeed? Be optimistic and constructive.',
        focus: 'Benefits, value, feasibility, positive outcomes'
      },
      {
        name: 'Green Hat — Creative Ideas',
        emoji: '🟩',
        color: 'green',
        promptPrefix: 'Think wildly creative. No idea is too crazy. What if we did the opposite? What\'s the most unexpected approach? Generate alternatives, provocations, and new possibilities.',
        focus: 'Creativity, alternatives, possibilities, new ideas'
      },
      {
        name: 'Blue Hat — Process & Meta',
        emoji: '🟦',
        color: 'blue',
        promptPrefix: 'Step back and manage the thinking process. What have we covered? What\'s missing? What should we focus on next? Summarize key insights and recommend a decision framework.',
        focus: 'Process control, summary, next steps, decision framework'
      }
    ]
  },

  personas: {
    name: 'Stakeholder Personas',
    description: 'View through different stakeholder lenses',
    emoji: '👥',
    perspectives: [
      {
        name: 'CEO / Business Owner',
        emoji: '👔',
        promptPrefix: 'You are a CEO evaluating this. Think about: ROI, scalability, competitive advantage, strategic alignment, resource requirements, and long-term impact.',
        focus: 'Strategy, growth, profitability, market position'
      },
      {
        name: 'Customer / End User',
        emoji: '🛒',
        promptPrefix: 'You are the target customer. Think about: Does this solve my problem? Is it worth my money/time? How does it compare to alternatives? What would make me choose this?',
        focus: 'Value, usability, price, alternatives, satisfaction'
      },
      {
        name: 'Competitor',
        emoji: '⚔️',
        promptPrefix: 'You are a competitor analyzing this. What are its weaknesses you could exploit? What makes it dangerous? How would you counter it? What would you steal?',
        focus: 'Threats, weaknesses to exploit, counter-strategies'
      },
      {
        name: 'Investor',
        emoji: '💰',
        promptPrefix: 'You are an investor evaluating this. What\'s the market size? What are the unit economics? Where\'s the moat? What\'s the risk/reward ratio? Would you put money in?',
        focus: 'Market size, economics, defensibility, risk/reward'
      },
      {
        name: 'Employee / Team Member',
        emoji: '👷',
        promptPrefix: 'You work at this company. How does this affect your daily work? Is this exciting or threatening? What skills would you need? Is leadership being realistic?',
        focus: 'Execution, morale, feasibility, culture impact'
      },
      {
        name: 'Regulator / Legal',
        emoji: '⚖️',
        promptPrefix: 'You are a UAE regulator or legal advisor. What compliance issues exist? What licenses are needed? Are there cultural sensitivities? What could get this shut down?',
        focus: 'Compliance, legal risk, cultural sensitivity, regulations'
      }
    ]
  },

  cultural: {
    name: 'UAE Cultural Lenses',
    description: 'Perspectives specific to the UAE/Dubai market',
    emoji: '🇦🇪',
    perspectives: [
      {
        name: 'UAE National (Emirati)',
        emoji: '🏛️',
        promptPrefix: 'You are an Emirati citizen. Consider: cultural values, national pride, Islamic principles, family traditions, Vision 2030 alignment. Does this respect local culture?',
        focus: 'Cultural authenticity, values alignment, national identity'
      },
      {
        name: 'Expat Professional',
        emoji: '🌍',
        promptPrefix: 'You are an expat working in Dubai. Consider: career relevance, social integration, value for money (with remittances), community building, transient lifestyle.',
        focus: 'Professional value, integration, practicality'
      },
      {
        name: 'Tourist / Visitor',
        emoji: '✈️',
        promptPrefix: 'You are a tourist visiting UAE. Consider: first impressions, wow factor, Instagram-worthiness, ease of access, comparison to global alternatives.',
        focus: 'Experience, accessibility, shareability'
      },
      {
        name: 'Government / Policy',
        emoji: '🏢',
        promptPrefix: 'You are a UAE government official. Consider: economic diversification, Emiratization, smart city goals, international reputation, sustainability targets.',
        focus: 'Policy alignment, national goals, global image'
      },
      {
        name: 'Youth (Gen Z/Millennial)',
        emoji: '🧑‍💻',
        promptPrefix: 'You are a young UAE resident (18-30). Consider: social media appeal, tech-savviness, mental health, career anxiety, desire for authenticity vs luxury image.',
        focus: 'Digital native, authenticity, trends, social impact'
      },
      {
        name: 'Traditional / Conservative',
        emoji: '🕌',
        promptPrefix: 'You hold traditional values. Consider: modesty, family appropriateness, Islamic compatibility, preservation of heritage, generational respect.',
        focus: 'Values, appropriateness, heritage, faith'
      }
    ]
  },

  timeline: {
    name: 'Timeline Perspectives',
    description: 'Past, present, and future analysis',
    emoji: '⏳',
    perspectives: [
      {
        name: 'Past — Historical Context',
        emoji: '📜',
        promptPrefix: 'Analyze this from a historical perspective. What similar things have been tried before? What worked and failed? What patterns from history apply? What lessons should we learn?',
        focus: 'Historical precedents, lessons learned, patterns'
      },
      {
        name: 'Present — Current Reality',
        emoji: '📍',
        promptPrefix: 'Analyze the current state. What\'s happening RIGHT NOW in this space? Who are the current players? What trends are active? What\'s the immediate opportunity or threat?',
        focus: 'Current market, active trends, immediate context'
      },
      {
        name: 'Future (1-2 years) — Near Term',
        emoji: '🔮',
        promptPrefix: 'Project 1-2 years ahead. What\'s likely to change? Which trends will accelerate? What new tech/regulations are coming? How should we prepare?',
        focus: 'Near-term trends, emerging tech, preparation'
      },
      {
        name: 'Future (5-10 years) — Long Term',
        emoji: '🚀',
        promptPrefix: 'Think 5-10 years out. What could this become? What mega-trends will reshape this space? What would future-you wish you had started today?',
        focus: 'Long-term vision, mega-trends, legacy'
      }
    ]
  },

  contrarian: {
    name: 'Contrarian Thinking',
    description: 'Challenge every assumption systematically',
    emoji: '🔄',
    perspectives: [
      {
        name: 'The Opposite',
        emoji: '↩️',
        promptPrefix: 'What if the OPPOSITE of the main idea is true? Argue passionately for the opposite position. Make it compelling.',
        focus: 'Inversion, challenging core assumptions'
      },
      {
        name: 'The Skeptic',
        emoji: '🤨',
        promptPrefix: 'You don\'t believe any of this. Question every claim. Demand evidence. What are they NOT telling you? Where\'s the spin?',
        focus: 'Critical questioning, hidden agendas, weak evidence'
      },
      {
        name: 'The Outsider',
        emoji: '👽',
        promptPrefix: 'You know nothing about this industry. Ask the "dumb" questions that insiders overlook. Why does everyone just accept these conventions?',
        focus: 'Fresh eyes, challenging conventions, beginner mind'
      },
      {
        name: 'The Extremist',
        emoji: '💥',
        promptPrefix: 'Take every aspect to its logical extreme. What if you 100x\'d the budget? What if you had zero budget? What if you removed the key constraint entirely?',
        focus: 'Extreme scenarios, constraint removal, scaling'
      },
      {
        name: 'The Minimalist',
        emoji: '🪨',
        promptPrefix: 'Strip everything down. What\'s the ONE thing that actually matters here? Everything else is noise. Find the essential core.',
        focus: 'Essentialism, core value, simplification'
      }
    ]
  }
};

// ============================================================
// Content Angle Generator
// ============================================================

const emotionalAppeals = [
  'Fear of missing out (FOMO)',
  'Aspiration / status',
  'Belonging / community',
  'Curiosity / intrigue',
  'Urgency / scarcity',
  'Nostalgia / comfort',
  'Empowerment / control',
  'Trust / safety',
  'Humor / entertainment',
  'Pride / achievement',
  'Relief / problem-solved',
  'Exclusivity / insider access'
];

const hookFormats = [
  'Controversial statement',
  'Surprising statistic',
  'Personal story opener',
  'Question that nags',
  'Bold prediction',
  'Myth-busting',
  'Before/after contrast',
  'Social proof (numbers)',
  'Pattern interrupt',
  'Relatable pain point'
];

const platformGuidelines = {
  instagram: {
    maxLength: 2200,
    idealLength: '150-300 chars for feed, longer for carousels',
    tone: 'Visual-first, emoji-friendly, hashtag-driven',
    cta: 'Save, share, DM, link in bio',
    tips: 'First line is the hook. Use line breaks. 20-30 hashtags in comments.'
  },
  linkedin: {
    maxLength: 3000,
    idealLength: '800-1500 chars',
    tone: 'Professional but personal, thought leadership, story-driven',
    cta: 'Comment, share, follow, visit link',
    tips: 'First 2 lines visible before "see more". Use short paragraphs. No hashtag spam (3-5 max).'
  },
  twitter: {
    maxLength: 280,
    idealLength: '100-200 chars for single, threads for depth',
    tone: 'Punchy, opinionated, conversational, witty',
    cta: 'Retweet, reply, follow, click link',
    tips: 'One idea per tweet. Threads start with a banger. Contrarian takes win.'
  },
  tiktok: {
    maxLength: 300,
    idealLength: '50-150 chars (video does the talking)',
    tone: 'Casual, trendy, authentic, Gen Z-friendly',
    cta: 'Follow, like, comment, stitch, duet',
    tips: 'Hook in first 3 seconds. Text overlays > captions. Trending sounds help.'
  },
  facebook: {
    maxLength: 63206,
    idealLength: '100-250 chars',
    tone: 'Community-focused, warm, shareable',
    cta: 'Share, react, comment, join group',
    tips: 'Questions drive engagement. Videos autoplay. Community groups > pages.'
  },
  youtube: {
    maxLength: 5000,
    idealLength: 'Title: 60 chars, Description: 200-500 chars above fold',
    tone: 'SEO-aware, descriptive, keyword-rich',
    cta: 'Subscribe, like, comment, bell icon',
    tips: 'Title and thumbnail = 80% of clicks. First 200 chars of description matter for SEO.'
  }
};

/**
 * Generate perspectives for a topic using a specified method
 * @param {string} topic
 * @param {string} method - 'sixhats', 'personas', 'cultural', 'timeline', 'contrarian'
 * @returns {{ method: object, perspectives: Array<object>, promptInstructions: string }}
 */
export function generatePerspectives(topic, method = 'sixhats') {
  const m = methods[method];
  if (!m) {
    const available = Object.keys(methods).join(', ');
    throw new Error(`Unknown method "${method}". Available: ${available}`);
  }

  const perspectives = m.perspectives.map(p => ({
    ...p,
    fullPrompt: `${p.promptPrefix}\n\nTopic: ${topic}\n\nProvide a detailed analysis from this perspective. Be specific, give examples, and make actionable recommendations where applicable.`
  }));

  const promptInstructions = `To use these perspectives, send each perspective's fullPrompt to an AI model one at a time.\nThen synthesize all responses into a comprehensive analysis.\n\nRecommended: Use Claude (temperature 0.4) for analytical perspectives, Gemini (temperature 0.8) for creative ones.`;

  return { method: m, perspectives, promptInstructions };
}

/**
 * Generate content angles for a topic
 * @param {string} topic
 * @param {string} audience
 * @param {string} platform
 * @returns {Array<object>}
 */
export function generateContentAngles(topic, audience = 'general', platform = 'instagram') {
  const platGuide = platformGuidelines[platform.toLowerCase()] || platformGuidelines.instagram;

  // Generate 7 diverse angles by combining different hooks + emotions
  const angles = [
    {
      name: 'The Contrarian Take',
      hook: `What if everything you know about ${topic} is wrong?`,
      hookFormat: 'Myth-busting',
      perspective: 'Challenge the conventional wisdom. Present an unexpected viewpoint.',
      emotionalAppeal: 'Curiosity / intrigue',
      ctaSuggestion: 'Comment with your opinion — agree or disagree?',
      promptForAI: `Write a ${platform} post that challenges conventional wisdom about "${topic}" for ${audience}. Start with a bold, contrarian hook. Back it up with evidence. End with a discussion-provoking CTA. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The Personal Story',
      hook: `I almost gave up on ${topic}. Here's what changed...`,
      hookFormat: 'Personal story opener',
      perspective: 'First-person narrative. Vulnerability builds connection.',
      emotionalAppeal: 'Belonging / community',
      ctaSuggestion: 'Share your experience in the comments',
      promptForAI: `Write a ${platform} post about "${topic}" for ${audience} using a personal story format. Start with a vulnerable moment, build through the struggle, end with the insight. Make it relatable. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The Data Drop',
      hook: `${topic}: the numbers nobody talks about 📊`,
      hookFormat: 'Surprising statistic',
      perspective: 'Lead with hard data. Let numbers tell the story.',
      emotionalAppeal: 'Trust / safety',
      ctaSuggestion: 'Save this for reference 📌',
      promptForAI: `Write a ${platform} post about "${topic}" for ${audience}. Lead with a surprising statistic. Break down the data in simple terms. Make the numbers tell a story. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The How-To',
      hook: `${topic} in 5 steps (no fluff, just action) ⚡`,
      hookFormat: 'Pattern interrupt',
      perspective: 'Pure value. Actionable steps the audience can use TODAY.',
      emotionalAppeal: 'Empowerment / control',
      ctaSuggestion: 'Which step are you starting with? Comment below 👇',
      promptForAI: `Write a ${platform} post giving 5 actionable steps related to "${topic}" for ${audience}. No theory — only practical, do-it-today advice. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The Future Vision',
      hook: `By 2027, ${topic} will look completely different. Here's why...`,
      hookFormat: 'Bold prediction',
      perspective: 'Forward-looking. Position as a thought leader.',
      emotionalAppeal: 'Fear of missing out (FOMO)',
      ctaSuggestion: 'Follow for more insights on where the industry is heading',
      promptForAI: `Write a ${platform} post making a bold prediction about the future of "${topic}" for ${audience}. Be specific with timeline. Explain the forces driving the change. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The Behind-the-Scenes',
      hook: `Here's what ${topic} actually looks like behind the scenes 🎬`,
      hookFormat: 'Relatable pain point',
      perspective: 'Raw, unfiltered, authentic. Show the messy reality.',
      emotionalAppeal: 'Humor / entertainment',
      ctaSuggestion: 'Tag someone who needs to see this 😂',
      promptForAI: `Write a ${platform} post showing the behind-the-scenes reality of "${topic}" for ${audience}. Be authentic and a bit self-deprecating. Contrast expectations vs reality. Platform guidelines: ${platGuide.tips}`
    },
    {
      name: 'The UAE Angle',
      hook: `Why ${topic} hits different in Dubai 🇦🇪`,
      hookFormat: 'Controversial statement',
      perspective: 'UAE-specific. Local context, regional flavor, cultural nuance.',
      emotionalAppeal: 'Pride / achievement',
      ctaSuggestion: 'Share with someone in Dubai who needs this',
      promptForAI: `Write a ${platform} post about "${topic}" specifically for the UAE/Dubai market (${audience}). Include local references, cultural context, and regional insights that a global post would miss. Platform guidelines: ${platGuide.tips}`
    }
  ];

  return {
    topic,
    audience,
    platform,
    platformGuide: platGuide,
    angles,
    usage: 'Pick the angle that fits your brand voice, then use the promptForAI with your preferred model.'
  };
}

// ============================================================
// SCAMPER Brainstorming
// ============================================================

const scamperMethods = [
  { letter: 'S', name: 'Substitute', prompt: 'What can you SUBSTITUTE? Replace a component, material, person, or process with something else.' },
  { letter: 'C', name: 'Combine', prompt: 'What can you COMBINE? Merge two ideas, functions, or products into one.' },
  { letter: 'A', name: 'Adapt', prompt: 'What can you ADAPT? Take an idea from another industry, context, or era and apply it here.' },
  { letter: 'M', name: 'Modify/Magnify', prompt: 'What can you MODIFY or MAGNIFY? Make it bigger, smaller, faster, slower, more extreme.' },
  { letter: 'P', name: 'Put to other use', prompt: 'What OTHER USES could this have? Who else could benefit? What other problems could it solve?' },
  { letter: 'E', name: 'Eliminate', prompt: 'What can you ELIMINATE? Remove steps, features, complexity, or constraints.' },
  { letter: 'R', name: 'Reverse/Rearrange', prompt: 'What if you REVERSED or REARRANGED it? Flip the order, swap roles, do it backwards.' }
];

const randomConstraints = [
  'It must work for a 5-year-old',
  'Budget is $0 — only free tools and creativity',
  'You have 24 hours maximum',
  'It must be explainable in one sentence',
  'No technology allowed',
  'It must work in Arabic and English equally',
  'It has to be fun / make people laugh',
  'A competitor must NOT be able to copy it easily',
  'It must create user-generated content',
  'It should work during Ramadan without being tone-deaf',
  'It needs to go viral organically (no ad spend)',
  'It must build long-term community, not just one-time engagement',
  'A grandmother and a Gen Z teenager must both find it relevant',
  'It should be doable by one person with no team'
];

/**
 * Brainstorm solutions using SCAMPER + random constraints
 * @param {string} problem
 * @param {string[]} constraints - Additional constraints (optional)
 * @returns {{ scamper: Array<object>, randomConstraints: string[], combinedPrompt: string }}
 */
export function brainstormWithConstraints(problem, constraints = []) {
  // Pick 3 random constraints to add creative pressure
  const shuffled = [...randomConstraints].sort(() => Math.random() - 0.5);
  const selectedConstraints = shuffled.slice(0, 3);
  const allConstraints = [...constraints, ...selectedConstraints];

  const scamper = scamperMethods.map(m => ({
    ...m,
    fullPrompt: `Problem: ${problem}\n\nUsing the SCAMPER method — ${m.name}:\n${m.prompt}\n\nConstraints to consider:\n${allConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nGenerate 3 specific, actionable ideas.`
  }));

  const combinedPrompt = `You are a creative problem-solver using SCAMPER methodology.

Problem: ${problem}

Constraints:
${allConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For EACH of the 7 SCAMPER lenses, generate 2-3 specific, actionable ideas:

${scamperMethods.map(m => `**${m.letter} — ${m.name}:** ${m.prompt}`).join('\n\n')}

End with your TOP 3 overall recommendations, combining insights from multiple lenses.`;

  return {
    problem,
    scamper,
    randomConstraints: selectedConstraints,
    userConstraints: constraints,
    combinedPrompt,
    usage: 'Send combinedPrompt to an AI model (suggested: Gemini at temperature 0.9 for maximum creativity, then Claude at 0.4 to evaluate feasibility).'
  };
}

/**
 * List available methods
 */
export function listMethods() {
  const lines = ['🧠 Available Perspective Methods:\n'];
  for (const [key, m] of Object.entries(methods)) {
    lines.push(`  ${m.emoji} ${key} — ${m.name}`);
    lines.push(`     ${m.description}`);
    lines.push(`     Perspectives: ${m.perspectives.map(p => p.emoji).join(' ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ============================================================
// CLI
// ============================================================

function printUsage() {
  console.log(`
🧠 Perspective Generator — Multi-method thinking tools

Usage:
  node perspectives.mjs list                          Show available methods
  node perspectives.mjs sixhats "topic"              Six Thinking Hats analysis
  node perspectives.mjs personas "topic"             Stakeholder perspectives
  node perspectives.mjs cultural "topic"             UAE cultural lenses
  node perspectives.mjs timeline "topic"             Past/Present/Future
  node perspectives.mjs contrarian "topic"           Challenge assumptions
  node perspectives.mjs angles "topic"               Content angle generator
    Options:
      --audience "..."     Target audience
      --platform "..."     Platform (instagram, linkedin, twitter, tiktok, youtube, facebook)
  node perspectives.mjs brainstorm "problem"         SCAMPER brainstorming
    Options:
      --constraint "..."   Add custom constraint (repeatable)

Examples:
  node perspectives.mjs sixhats "launching a luxury spa in Dubai Marina"
  node perspectives.mjs angles "AI in healthcare" --audience "UAE professionals" --platform "linkedin"
  node perspectives.mjs brainstorm "increase Instagram engagement for a restaurant"
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
  const constraints = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--constraint' && i + 1 < args.length) {
      constraints.push(args[i + 1]);
      i++;
    } else if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  flags._constraints = constraints;
  return flags;
}

function getTopicFromArgs() {
  const topicParts = [];
  const rest = args.slice(1);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      i++; // skip flag value
      continue;
    }
    topicParts.push(rest[i]);
  }
  return topicParts.join(' ').replace(/^["']|["']$/g, '');
}

switch (command) {
  case 'list': {
    console.log(listMethods());
    break;
  }

  case 'sixhats':
  case 'personas':
  case 'cultural':
  case 'timeline':
  case 'contrarian': {
    const topic = getTopicFromArgs();
    if (!topic) {
      console.error(`Usage: ${command} "topic to analyze"`);
      process.exit(1);
    }
    try {
      const result = generatePerspectives(topic, command);
      console.log(`\n${result.method.emoji} ${result.method.name}\n`);
      console.log(`Topic: ${topic}\n`);
      console.log('═'.repeat(50));
      for (const p of result.perspectives) {
        console.log(`\n${p.emoji} ${p.name}`);
        console.log(`   Focus: ${p.focus}`);
        console.log(`\n   Prompt:\n   ${p.fullPrompt.split('\n').join('\n   ')}`);
        console.log('─'.repeat(50));
      }
      console.log(`\n💡 ${result.promptInstructions}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }

  case 'angles': {
    const topic = getTopicFromArgs();
    const flags = parseFlags(args.slice(1));
    if (!topic) {
      console.error('Usage: angles "topic" --audience "..." --platform "..."');
      process.exit(1);
    }
    const result = generateContentAngles(topic, flags.audience || 'general', flags.platform || 'instagram');
    console.log(`\n🎯 Content Angles for: ${result.topic}\n`);
    console.log(`Audience: ${result.audience}`);
    console.log(`Platform: ${result.platform}`);
    console.log(`Platform tips: ${result.platformGuide.tips}\n`);
    console.log('═'.repeat(50));
    for (const angle of result.angles) {
      console.log(`\n📐 ${angle.name}`);
      console.log(`   Hook: "${angle.hook}"`);
      console.log(`   Format: ${angle.hookFormat}`);
      console.log(`   Emotion: ${angle.emotionalAppeal}`);
      console.log(`   CTA: ${angle.ctaSuggestion}`);
      console.log(`   Perspective: ${angle.perspective}`);
      console.log('─'.repeat(50));
    }
    console.log(`\n💡 ${result.usage}`);
    break;
  }

  case 'brainstorm': {
    const topic = getTopicFromArgs();
    const flags = parseFlags(args.slice(1));
    if (!topic) {
      console.error('Usage: brainstorm "problem" [--constraint "..."]');
      process.exit(1);
    }
    const result = brainstormWithConstraints(topic, flags._constraints || []);
    console.log(`\n🧠 SCAMPER Brainstorm\n`);
    console.log(`Problem: ${result.problem}\n`);
    console.log('Random constraints added for creative pressure:');
    for (const c of result.randomConstraints) console.log(`  🎲 ${c}`);
    if (result.userConstraints.length) {
      console.log('\nYour constraints:');
      for (const c of result.userConstraints) console.log(`  📌 ${c}`);
    }
    console.log('\n' + '═'.repeat(50));
    for (const s of result.scamper) {
      console.log(`\n${s.letter} — ${s.name}`);
      console.log(`   ${s.prompt}`);
      console.log('─'.repeat(50));
    }
    console.log('\n💡 Combined prompt ready to send to AI model.');
    console.log('   Suggested: Gemini (temp 0.9) for ideas → Claude (temp 0.4) to evaluate\n');
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
