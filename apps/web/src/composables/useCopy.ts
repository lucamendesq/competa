import { onScopeDispose, ref } from 'vue';
import { toast } from 'vue-sonner';

export function useCopy(resetMs = 2500) {
  const copiedKey = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onScopeDispose(() => clearTimeout(timer));

  async function copy(text: string, message: string, key = 'default') {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey.value = key;
      clearTimeout(timer);
      timer = setTimeout(() => (copiedKey.value = null), resetMs);
      toast.success(message);
      return true;
    } catch {
      toast.error('Não foi possível copiar o link.');
      return false;
    }
  }

  return { copiedKey, copy };
}
