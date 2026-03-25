/**
 * Reflexion Loop — PyraAI 🦊
 * تقييم ذاتي وتحسين تكراري للمخرجات
 */

const QUALITY_THRESHOLD = 7;

/**
 * Evaluate output quality on a 1-10 scale
 * @param {string} task - Task description
 * @param {string} output - Generated output
 * @returns {{score: number, strengths: string[], weaknesses: string[], overall: string}}
 */
export function evaluateOutput(task, output) {
  const checks = [];
  let score = 5; // baseline

  // Length check
  if (output.length > 100) { score += 1; checks.push({ type: 'strength', msg: 'محتوى كافي' }); }
  if (output.length > 500) { score += 0.5; }
  if (output.length < 50) { score -= 2; checks.push({ type: 'weakness', msg: 'محتوى قصير جداً' }); }

  // Structure check
  if (output.includes('\n') && output.split('\n').length > 3) {
    score += 1; checks.push({ type: 'strength', msg: 'منظم ومقسم' });
  }

  // Arabic content check
  const arabicRatio = (output.match(/[\u0600-\u06FF]/g) || []).length / output.length;
  if (arabicRatio > 0.3) {
    score += 0.5; checks.push({ type: 'strength', msg: 'محتوى عربي جيد' });
  }

  // Code check (if task is coding)
  if (task.toLowerCase().includes('code') || task.includes('كود')) {
    if (output.includes('```') || output.includes('function') || output.includes('const')) {
      score += 1; checks.push({ type: 'strength', msg: 'يحتوي كود' });
    }
  }

  // Completeness heuristic
  if (output.includes('✅') || output.includes('done') || output.includes('تم')) {
    score += 0.5; checks.push({ type: 'strength', msg: 'يبدو مكتمل' });
  }

  score = Math.min(10, Math.max(1, Math.round(score * 10) / 10));

  return {
    score,
    strengths: checks.filter(c => c.type === 'strength').map(c => c.msg),
    weaknesses: checks.filter(c => c.type === 'weakness').map(c => c.msg),
    overall: score >= 8 ? 'ممتاز' : score >= 6 ? 'جيد' : score >= 4 ? 'مقبول' : 'يحتاج تحسين'
  };
}

/**
 * Suggest improvements based on evaluation
 * @param {string} task
 * @param {string} output
 * @param {number} score
 * @returns {string[]}
 */
export function suggestImprovements(task, output, score) {
  const suggestions = [];

  if (score < 4) suggestions.push('أعد الكتابة من الصفر — الجودة منخفضة جداً');
  if (output.length < 100) suggestions.push('أضف تفاصيل أكثر — المحتوى قصير');
  if (!output.includes('\n')) suggestions.push('قسّم المحتوى لفقرات أو نقاط');
  if (score < 7) suggestions.push('راجع المطلوب وتأكد إن كل النقاط مغطاة');
  if (task.includes('عربي') && (output.match(/[\u0600-\u06FF]/g) || []).length < 20) {
    suggestions.push('المحتوى لازم يكون بالعربي أكثر');
  }

  return suggestions.length > 0 ? suggestions : ['المخرجات جيدة — ما في تحسينات مطلوبة'];
}

/**
 * Reflexion loop — iteratively improve output
 * @param {string} task
 * @param {function} generateFn - async (task, feedback?) => string
 * @param {number} maxIterations
 * @returns {Promise<{finalOutput: string, iterations: number, finalScore: number, history: Array}>}
 */
export async function reflexionLoop(task, generateFn, maxIterations = 3) {
  const history = [];
  let output = await generateFn(task);
  let evaluation = evaluateOutput(task, output);
  history.push({ iteration: 1, score: evaluation.score, output: output.substring(0, 200) });

  let iteration = 1;
  while (evaluation.score < QUALITY_THRESHOLD && iteration < maxIterations) {
    iteration++;
    const feedback = suggestImprovements(task, output, evaluation.score).join('; ');
    output = await generateFn(task, feedback);
    evaluation = evaluateOutput(task, output);
    history.push({ iteration, score: evaluation.score, output: output.substring(0, 200) });
  }

  return {
    finalOutput: output,
    iterations: iteration,
    finalScore: evaluation.score,
    history
  };
}

export default { evaluateOutput, suggestImprovements, reflexionLoop };
