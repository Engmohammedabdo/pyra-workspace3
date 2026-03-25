/**
 * Evaluator-Optimizer — PyraAI 🦊
 * فحص جودة المخرجات وتحسينها بناءً على معايير محددة
 */

const CRITERIA_DEFINITIONS = {
  accuracy: { name: 'الدقة', weight: 1.5, description: 'هل المعلومات صحيحة ودقيقة؟' },
  completeness: { name: 'الاكتمال', weight: 1.3, description: 'هل كل النقاط المطلوبة مغطاة؟' },
  tone: { name: 'النبرة', weight: 1.0, description: 'هل النبرة مناسبة للسياق؟' },
  arabic_quality: { name: 'جودة العربي', weight: 1.2, description: 'هل العربي سليم وطبيعي؟' },
  creativity: { name: 'الإبداعية', weight: 1.0, description: 'هل المحتوى مبتكر وغير تقليدي؟' },
  structure: { name: 'التنظيم', weight: 1.1, description: 'هل المحتوى منظم وسهل القراءة؟' }
};

/**
 * Evaluate content against specified criteria
 * @param {string} content - Content to evaluate
 * @param {string[]} criteria - Array of criteria keys
 * @returns {{scores: Object, weightedAvg: number, feedback: Object, grade: string}}
 */
export function evaluate(content, criteria = ['accuracy', 'completeness', 'tone']) {
  const scores = {};
  const feedback = {};
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const key of criteria) {
    const def = CRITERIA_DEFINITIONS[key];
    if (!def) continue;

    let score = 5;
    const notes = [];

    switch (key) {
      case 'accuracy':
        if (content.includes('مصدر') || content.includes('source') || content.includes('حسب')) {
          score += 2; notes.push('يذكر مصادر');
        }
        if (content.includes('⚠️') || content.includes('ملاحظة')) {
          score += 1; notes.push('يوضح التحفظات');
        }
        break;

      case 'completeness':
        const sections = content.split('\n\n').length;
        if (sections >= 3) { score += 2; notes.push(`${sections} أقسام`); }
        if (content.length > 300) { score += 1; notes.push('محتوى غني'); }
        break;

      case 'tone':
        if (content.includes('😊') || content.includes('🦊') || content.includes('⚡')) {
          score += 1; notes.push('نبرة ودية');
        }
        if (!content.includes('!!!!!') && !content.toUpperCase() !== content) {
          score += 1; notes.push('نبرة متزنة');
        }
        break;

      case 'arabic_quality':
        const arabicChars = (content.match(/[\u0600-\u06FF]/g) || []).length;
        const ratio = arabicChars / Math.max(content.length, 1);
        if (ratio > 0.4) { score += 3; notes.push('عربي سليم'); }
        else if (ratio > 0.2) { score += 1; notes.push('مزيج عربي/إنجليزي'); }
        break;

      case 'creativity':
        const uniqueWords = new Set(content.split(/\s+/)).size;
        if (uniqueWords > 50) { score += 2; notes.push('مفردات متنوعة'); }
        if (content.includes('💡') || content.includes('فكرة') || content.includes('بديل')) {
          score += 1; notes.push('أفكار إبداعية');
        }
        break;

      case 'structure':
        if (content.includes('##') || content.includes('**')) {
          score += 2; notes.push('عناوين واضحة');
        }
        if (content.includes('- ') || content.includes('1.')) {
          score += 1; notes.push('قوائم منظمة');
        }
        break;
    }

    score = Math.min(10, Math.max(1, score));
    scores[key] = score;
    feedback[key] = { score, name: def.name, notes };
    totalWeighted += score * def.weight;
    totalWeight += def.weight;
  }

  const weightedAvg = Math.round((totalWeighted / totalWeight) * 10) / 10;
  const grade = weightedAvg >= 8 ? 'A' : weightedAvg >= 6 ? 'B' : weightedAvg >= 4 ? 'C' : 'D';

  return { scores, weightedAvg, feedback, grade };
}

/**
 * Generate optimization suggestions based on feedback
 * @param {string} content
 * @param {Object} evaluationFeedback - from evaluate()
 * @returns {{suggestions: string[], priority: string}}
 */
export function optimize(content, evaluationFeedback) {
  const suggestions = [];
  const { feedback, weightedAvg } = evaluationFeedback;

  for (const [key, data] of Object.entries(feedback)) {
    if (data.score < 5) {
      const def = CRITERIA_DEFINITIONS[key];
      suggestions.push(`⚠️ ${def.name} (${data.score}/10): ${def.description}`);
    }
  }

  if (content.length < 100) suggestions.push('📝 أضف محتوى أكثر — الإجابة قصيرة');
  if (!content.includes('\n')) suggestions.push('📋 قسّم المحتوى لفقرات');

  const priority = weightedAvg < 4 ? 'عاجل' : weightedAvg < 6 ? 'مهم' : 'تحسيني';

  return { suggestions, priority };
}

/**
 * Quick quality check — returns pass/fail
 * @param {string} content
 * @param {number} minScore
 * @returns {{pass: boolean, score: number, grade: string}}
 */
export function quickCheck(content, minScore = 6) {
  const result = evaluate(content, ['accuracy', 'completeness', 'structure']);
  return {
    pass: result.weightedAvg >= minScore,
    score: result.weightedAvg,
    grade: result.grade
  };
}

export default { evaluate, optimize, quickCheck, CRITERIA_DEFINITIONS };
