'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function WebhookEvents({
  selectedEvents,
  toggleEvent,
  availableEvents
}: {
  selectedEvents: string[];
  toggleEvent: (value: string) => void;
  availableEvents: { value: string; label: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>الأحداث <span className="text-destructive">*</span></CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {availableEvents.map(event => (
            <label
              key={event.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedEvents.includes(event.value)
                  ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedEvents.includes(event.value)}
                onChange={() => toggleEvent(event.value)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm font-medium">{event.label}</span>
              <span className="text-xs text-muted-foreground font-mono ms-auto" dir="ltr">
                {event.value}
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
