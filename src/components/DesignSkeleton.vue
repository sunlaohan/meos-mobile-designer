<script setup lang="ts">
import { computed } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import LanguageToggle from './LanguageToggle.vue';
import PageGridSkeleton from './PageGridSkeleton.vue';
import { useI18n } from '../utils/i18n';
import type { DesignLoadingVariant } from '../utils/designLoading';
import '../skeleton.css';

const props = withDefaults(defineProps<{ variant?: DesignLoadingVariant }>(), { variant: 'workspace' });
const { t } = useI18n();
const label = computed(() => t(props.variant === 'workspace' ? '正在打开设计空间…' : props.variant === 'preview' ? '正在加载页面预览…' : '正在加载设计页面…'));
</script>

<template>
  <main class="design-skeleton" :class="`design-skeleton--${variant}`" aria-busy="true" :aria-label="label">
    <span class="skeleton-status" role="status">{{ label }}</span>
    <header class="skeleton-header">
      <div class="skeleton-brand"><span class="skeleton-brand-mark">C</span><strong v-if="variant === 'workspace'">Compose</strong><div v-else class="skeleton-block skeleton-file-name" aria-hidden="true" /></div>
      <div v-if="variant === 'editor'" class="skeleton-editor-tools" aria-hidden="true"><div class="skeleton-block skeleton-icon" /><div class="skeleton-block skeleton-icon" /><div class="skeleton-block skeleton-device" /></div>
      <div class="skeleton-header-actions">
        <div class="surface-controls"><ThemeToggle /><LanguageToggle /></div>
        <div class="skeleton-block skeleton-user" aria-hidden="true" />
        <div class="skeleton-block skeleton-action" aria-hidden="true" />
        <div v-if="variant !== 'preview'" class="skeleton-block skeleton-action skeleton-action-short" aria-hidden="true" />
      </div>
    </header>

    <div v-if="variant === 'workspace'" class="skeleton-workspace" aria-hidden="true">
      <div class="skeleton-heading"><div><div class="skeleton-block skeleton-eyebrow" /><div class="skeleton-title-row"><div class="skeleton-block skeleton-title" /><div class="skeleton-block skeleton-count" /></div><div class="skeleton-block skeleton-subtitle" /></div><div class="skeleton-block skeleton-primary" /></div>
      <div class="skeleton-banner"><div class="skeleton-block skeleton-banner-icon" /><div class="skeleton-banner-copy"><div class="skeleton-block skeleton-banner-title" /><div class="skeleton-block skeleton-banner-detail" /></div><div class="skeleton-block skeleton-banner-status" /></div>
      <div class="skeleton-list-controls"><div class="skeleton-block skeleton-search" /><div class="skeleton-block skeleton-import" /><div class="skeleton-block skeleton-refresh" /></div>
      <PageGridSkeleton />
      <div class="skeleton-block skeleton-footer" />
    </div>

    <div v-else-if="variant === 'editor'" class="skeleton-editor" aria-hidden="true">
      <aside class="skeleton-library"><div class="skeleton-block skeleton-panel-heading" /><div class="skeleton-block skeleton-tabs" /><div class="skeleton-block skeleton-prompt" /><div class="skeleton-block skeleton-panel-search" /><div class="skeleton-component-grid"><div v-for="index in 8" :key="index" class="skeleton-component"><div class="skeleton-block skeleton-component-image" /><div class="skeleton-block skeleton-component-name" /></div></div></aside>
      <div class="skeleton-canvas"><div class="skeleton-phone"><div class="skeleton-block skeleton-phone-nav" /><div class="skeleton-block skeleton-phone-heading" /><div v-for="index in 4" :key="index" class="skeleton-block skeleton-phone-row" /></div></div>
      <aside class="skeleton-properties"><div class="skeleton-block skeleton-tabs" /><div class="skeleton-block skeleton-panel-heading" /><div v-for="index in 6" :key="index" class="skeleton-property"><div class="skeleton-block skeleton-property-label" /><div class="skeleton-block skeleton-property-input" /></div></aside>
    </div>

    <div v-else class="skeleton-preview" aria-hidden="true"><div class="skeleton-phone"><div class="skeleton-block skeleton-phone-nav" /><div class="skeleton-block skeleton-phone-heading" /><div v-for="index in 4" :key="index" class="skeleton-block skeleton-phone-row" /></div></div>
  </main>
</template>
