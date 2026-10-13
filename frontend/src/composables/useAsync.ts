import { onMounted, onUnmounted, ref, shallowRef, type Ref } from 'vue';

interface Options<T> {
  /** Re-fetch every N ms (silently, without toggling `loading`). */
  pollMs?: number;
  /** Stop polling once this returns true (e.g. a request reached a final state). */
  stopWhen?: (data: T | null) => boolean;
}

/**
 * Loads data on mount and exposes { data, loading, error, refresh }.
 * Optional polling keeps observability views fresh while agents work in the background.
 */
export function useAsync<T>(loader: () => Promise<T>, options: Options<T> = {}) {
  const data = shallowRef<T | null>(null) as Ref<T | null>;
  const loading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh({ silent = false } = {}) {
    if (!silent) loading.value = true;
    try {
      data.value = await loader();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unexpected error';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void refresh();
    if (options.pollMs) {
      timer = setInterval(() => {
        if (options.stopWhen?.(data.value)) return clearInterval(timer);
        if (document.visibilityState === 'visible') void refresh({ silent: true });
      }, options.pollMs);
    }
  });

  onUnmounted(() => clearInterval(timer));

  return { data, loading, error, refresh };
}
