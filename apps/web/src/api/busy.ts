import { computed, ref } from 'vue';

const inFlight = ref(0);

export const isBusy = computed(() => inFlight.value > 0);

export async function trackBusy<T>(run: () => Promise<T>): Promise<T> {
  inFlight.value += 1;
  try {
    return await run();
  } finally {
    inFlight.value -= 1;
  }
}
