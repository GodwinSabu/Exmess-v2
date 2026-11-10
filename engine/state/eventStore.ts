const processedEvents = new Set<string>();

// Price updates arrive several times a second, so the set is capped:
// only recent ids matter for de-duplicating a redelivery.
const MAX_TRACKED_EVENTS = 10_000;

export function hasProcessed(id: string): boolean {
  return processedEvents.has(id);
}

export function markProcessed(id: string) {
  processedEvents.add(id);

  if (processedEvents.size > MAX_TRACKED_EVENTS) {
    // Sets iterate in insertion order, so the first value is the oldest.
    const oldest = processedEvents.values().next().value;
    if (oldest !== undefined) processedEvents.delete(oldest);
  }
}

export function getAllProcessedEvents() {
  return processedEvents;
}
