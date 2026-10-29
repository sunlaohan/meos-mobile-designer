import { computed, readonly, ref } from 'vue';

export function useAsyncAction(onError: (error: unknown) => void, blocked: () => boolean = () => false) {
  const pending = ref('');
  const busy = computed(() => Boolean(pending.value) || blocked());
  async function run(key: string, action: () => Promise<void>) {
    if (busy.value) return;
    pending.value = key;
    try { await action(); }
    catch (error) { onError(error); }
    finally { pending.value = ''; }
  }
  return { pending: readonly(pending), busy, run };
}
