<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Download, FileClock, X } from 'lucide-vue-next';
import type { DesignDraft } from '../utils/designDrafts';
import { formatDate, useI18n } from '../utils/i18n';
const { t } = useI18n();
const props = defineProps<{ drafts: DesignDraft[]; cloudRevision: string; error?: string }>();
const emit = defineEmits<{ (event: 'restore', id: string): void; (event: 'keep'): void; (event: 'download', draft: DesignDraft): void }>();
const selectedId = ref(props.drafts[0]?.writerId || '');
const selected = computed(() => props.drafts.find(draft => draft.writerId === selectedId.value));
const dialog = ref<HTMLElement>();
let previousFocus: HTMLElement | null;
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('keep'); }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') || [])];
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => { previousFocus = document.activeElement as HTMLElement | null; await nextTick(); dialog.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); });
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<template>
  <Teleport to="body">
    <div class="draft-recovery-backdrop">
      <section ref="dialog" class="draft-recovery-dialog" :data-cloud-revision="cloudRevision" role="dialog" aria-modal="true" aria-labelledby="draft-recovery-title" @keydown.stop="keydown">
        <header><div><h2 id="draft-recovery-title"><FileClock :size="21" />{{ t('本机草稿') }}</h2><p>{{ t('发现此账号、此页面在本机保留的版本。未选择的草稿不会删除。') }}</p></div><button :aria-label="t('关闭草稿选择')" @click="emit('keep')"><X :size="18" /></button></header>
        <div class="draft-recovery-list" role="radiogroup" :aria-label="t('选择要恢复的草稿')">
          <button v-for="draft in drafts" :key="draft.writerId" role="radio" :aria-checked="selectedId === draft.writerId" :data-draft-id="draft.writerId" :data-base-revision="draft.baseRevision" @click="selectedId = draft.writerId">
            <span class="draft-radio" /><span><strong>{{ draft.document.title || t('未命名页面') }}</strong><small>{{ formatDate(draft.modifiedAt, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }} · {{ t('{0} 个组件', [draft.document.nodes.length]) }}</small></span><em v-if="draft.baseRevision !== cloudRevision">{{ t('云端版本已变化') }}</em>
          </button>
          <p v-if="!drafts.length">{{ t('当前没有本机草稿') }}</p>
        </div>
        <p class="draft-recovery-help">{{ selected && selected.baseRevision !== cloudRevision ? t('恢复后仅在画板中编辑，不会覆盖云端；请另存为副本。') : t('恢复后继续自动同步；选择使用当前版本，也会保留其他本机草稿。') }}</p>
        <p v-if="error" class="draft-recovery-error" role="alert">{{ t(error) }}</p>
        <footer><button class="toolbar-button" :disabled="!selected" @click="selected && emit('download', selected)"><Download :size="15" />{{ t('导出此草稿') }}</button><span /><button class="toolbar-button" @click="emit('keep')">{{ t('使用当前版本') }}</button><button class="primary-toolbar-button" :disabled="!selected" @click="selected && emit('restore', selected.writerId)">{{ t('恢复到画板') }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>
