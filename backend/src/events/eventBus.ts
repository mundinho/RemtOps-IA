import { EventEmitter } from 'node:events';
import type { RegistrationFacts } from '../agents/onboarding/rules.js';

/** Domain events. The HTTP layer emits them; the Orchestrator reacts. */
export interface DomainEvents {
  'rental.requested': { rentalId: string };
  /** Starts a proactive monitoring cycle (from the scheduler or the dashboard button). */
  'monitoring.tick': { trigger: string };
  /** A customer self-registered; the Onboarding Agent activates or rejects the account. */
  'customer.registered': { customerId: string; facts: RegistrationFacts };
}

/**
 * In-process, typed event bus. It decouples "a request arrived" from "who processes it":
 * the HTTP request returns 202 immediately, agents work in the background.
 * In production this would be a queue (BullMQ/Redis, SQS) with the same event names.
 */
class EventBus {
  private emitter = new EventEmitter();

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void | Promise<void>) {
    this.emitter.on(event, (payload: DomainEvents[K]) => {
      Promise.resolve(handler(payload)).catch((error) => console.error(`[eventBus] ${event} handler failed:`, error));
    });
  }
}

export const eventBus = new EventBus();
