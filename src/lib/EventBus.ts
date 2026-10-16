/**
 * Minimal typed publish/subscribe bus (Observer pattern).
 * Lets services announce what happened without knowing who is listening
 * (result card, cart, label dialog, analytics...).
 *
 * @typeParam Events map of event name -> payload type
 */
export class EventBus<Events extends Record<string, unknown>> {
  #handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  /** @returns unsubscribe function (handy as a React effect cleanup) */
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.#handlers.get(event);
    if (!set) this.#handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const handler of this.#handlers.get(event) ?? []) {
      try {
        (handler as (payload: Events[K]) => void)(payload);
      } catch (err) {
        // One broken listener must not stop the others.
        console.error(`[EventBus] handler for "${String(event)}" failed`, err);
      }
    }
  }
}
