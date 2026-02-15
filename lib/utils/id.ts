import { nanoid } from 'nanoid';

export function generateId(prefix: string = ''): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = nanoid(32);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}
