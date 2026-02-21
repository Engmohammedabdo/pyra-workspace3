export interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * Evaluate all conditions against event data.
 * Returns true if ALL conditions are met (AND logic).
 * An empty or missing conditions array always passes.
 */
export function evaluateConditions(
  conditions: Condition[],
  data: Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const fieldValue = getNestedValue(data, condition.field);
    return evaluateOperator(fieldValue, condition.operator, condition.value);
  });
}

/** Resolve a dot-separated path like "project.status" from a nested object. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Compare fieldValue against conditionValue using the given operator. */
function evaluateOperator(
  fieldValue: unknown,
  operator: string,
  conditionValue: unknown
): boolean {
  switch (operator) {
    case 'equals':
      return String(fieldValue) === String(conditionValue);
    case 'not_equals':
      return String(fieldValue) !== String(conditionValue);
    case 'contains':
      return String(fieldValue)
        .toLowerCase()
        .includes(String(conditionValue).toLowerCase());
    case 'starts_with':
      return String(fieldValue)
        .toLowerCase()
        .startsWith(String(conditionValue).toLowerCase());
    case 'greater_than':
      return Number(fieldValue) > Number(conditionValue);
    case 'less_than':
      return Number(fieldValue) < Number(conditionValue);
    case 'is_empty':
      return !fieldValue || String(fieldValue).trim() === '';
    case 'is_not_empty':
      return !!fieldValue && String(fieldValue).trim() !== '';
    default:
      return true;
  }
}
