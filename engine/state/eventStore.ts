const processedEvents = new Set<string>();

export function hasProcessed(id: string): boolean {
  return processedEvents.has(id);
}

export function markProcessed(id: string) {
  processedEvents.add(id);
}

export function getAllProcessedEvents() {
  return processedEvents;
}