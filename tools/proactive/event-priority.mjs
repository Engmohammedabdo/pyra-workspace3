/**
 * Event Priority Engine — PyraAI 🦊
 * تصنيف الأحداث حسب الأولوية والأهمية
 */

const PRIORITY_LEVELS = { critical: 4, high: 3, medium: 2, low: 1 };

const CRITICAL_KEYWORDS = ['urgent', 'عاجل', 'emergency', 'down', 'error', 'failed', 'payment', 'دفع'];
const HIGH_KEYWORDS = ['meeting', 'اجتماع', 'deadline', 'موعد', 'client', 'عميل', 'invoice', 'فاتورة'];
const MEDIUM_KEYWORDS = ['update', 'تحديث', 'reminder', 'تذكير', 'follow-up', 'متابعة'];

const VIP_SENDERS = ['mohammed', 'محمد', 'eng.moabdo22'];

/**
 * Classify an event by priority
 * @param {{type: string, content: string, sender?: string, timestamp?: number}} event
 * @returns {{priority: string, score: number, reason: string, action: string}}
 */
export function classifyEvent(event) {
  const text = (event.content || '').toLowerCase();
  const sender = (event.sender || '').toLowerCase();
  const type = event.type || 'unknown';
  let score = 0;
  let reasons = [];

  // Server alerts are always critical
  if (type === 'server_alert') {
    return { priority: 'critical', score: 4, reason: 'تنبيه سيرفر', action: 'notify_immediately' };
  }

  // VIP sender boost
  if (VIP_SENDERS.some(v => sender.includes(v))) {
    score += 2;
    reasons.push('مرسل VIP');
  }

  // Keyword matching
  if (CRITICAL_KEYWORDS.some(k => text.includes(k))) {
    score += 4;
    reasons.push('كلمات حرجة');
  } else if (HIGH_KEYWORDS.some(k => text.includes(k))) {
    score += 3;
    reasons.push('كلمات مهمة');
  } else if (MEDIUM_KEYWORDS.some(k => text.includes(k))) {
    score += 2;
    reasons.push('كلمات متوسطة');
  }

  // Time sensitivity (event within 2 hours)
  if (event.timestamp) {
    const hoursAway = (event.timestamp - Date.now()) / (1000 * 60 * 60);
    if (hoursAway > 0 && hoursAway <= 2) {
      score += 2;
      reasons.push('خلال ساعتين');
    }
  }

  // Type-based boost
  if (type === 'calendar') score += 1;
  if (type === 'whatsapp' && VIP_SENDERS.some(v => sender.includes(v))) score += 1;

  // Determine priority level
  let priority = 'low';
  if (score >= 6) priority = 'critical';
  else if (score >= 4) priority = 'high';
  else if (score >= 2) priority = 'medium';

  const actions = {
    critical: 'notify_immediately',
    high: 'notify_soon',
    medium: 'queue_notification',
    low: 'log_only'
  };

  return {
    priority,
    score,
    reason: reasons.join(' + ') || 'تصنيف عام',
    action: actions[priority]
  };
}

/**
 * Should we notify Mohammed about this event?
 * @param {{type: string, content: string, sender?: string}} event
 * @returns {boolean}
 */
export function shouldNotify(event) {
  const { priority } = classifyEvent(event);
  return priority === 'critical' || priority === 'high';
}

/**
 * Batch classify multiple events and sort by priority
 * @param {Array} events
 * @returns {Array}
 */
export function rankEvents(events) {
  return events
    .map(e => ({ ...e, classification: classifyEvent(e) }))
    .sort((a, b) => b.classification.score - a.classification.score);
}

export default { classifyEvent, shouldNotify, rankEvents };
