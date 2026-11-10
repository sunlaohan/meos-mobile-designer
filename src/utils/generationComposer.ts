import { computed, reactive, ref } from 'vue';
import type { BuildAttachment, PageBuildRequest } from '../types';

export function createGenerationComposer(defaultPrompt: string) {
  const inputMode = ref<'requirements' | 'image'>('requirements');
  const drafts = reactive({
    requirements: { prompt: defaultPrompt, attachments: [] as BuildAttachment[] },
    image: { prompt: '', attachments: [] as BuildAttachment[] },
  });
  const prompt = computed({ get: () => drafts[inputMode.value].prompt, set: value => { drafts[inputMode.value].prompt = value; } });
  const attachments = computed({ get: () => drafts[inputMode.value].attachments, set: value => { drafts[inputMode.value].attachments = value; } });
  const hasInput = computed(() => inputMode.value === 'image'
    ? attachments.value.some(item => item.kind === 'image')
    : !!(prompt.value.trim() || attachments.value.length));

  function request(model: string): PageBuildRequest {
    return { inputMode: inputMode.value, ...(inputMode.value === 'image' ? { imageAction: 'beautify' as const } : {}),
      prompt: prompt.value.trim(), model, attachments: attachments.value.map(item => ({ ...item })) };
  }
  return { inputMode, drafts, prompt, attachments, hasInput, request };
}
