import type { DeliveryPort } from '../ports.js';
import type { DeliveryRef, TaskCandidate } from '../types.js';

export function createFakeDelivery(): DeliveryPort & { delivered: TaskCandidate[] } {
  const delivered: TaskCandidate[] = [];
  return {
    delivered,
    async deliver(task: TaskCandidate): Promise<DeliveryRef> {
      delivered.push(task);
      return { system: 'fake', externalId: `fake-${task.id}` };
    },
  };
}
