<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next';
import { useNotifications } from '../utils/notifications';
import { useI18n } from '../utils/i18n';

const { messages, dismiss, pause, resume, clear } = useNotifications();
const { t } = useI18n();
onBeforeUnmount(clear);
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="global-notice" tag="div" class="global-notifications">
      <div v-for="item in messages" :key="item.id" class="global-notification" :class="`global-notification--${item.kind}`" :role="item.kind === 'error' ? 'alert' : 'status'" aria-atomic="true" @mouseenter="pause(item.id)" @mouseleave="resume(item.id)" @focusin="pause(item.id)" @focusout="resume(item.id)">
        <AlertCircle v-if="item.kind === 'error'" class="global-notification-icon" :size="20" aria-hidden="true" />
        <AlertTriangle v-else-if="item.kind === 'warning'" class="global-notification-icon" :size="20" aria-hidden="true" />
        <Info v-else-if="item.kind === 'info'" class="global-notification-icon" :size="20" aria-hidden="true" />
        <CheckCircle2 v-else class="global-notification-icon" :size="20" aria-hidden="true" />
        <p>{{ t(item.message) }}</p>
        <button type="button" class="global-notification-close" :aria-label="t('关闭提示')" @click="dismiss(item.id)"><X :size="16" aria-hidden="true" /></button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>
