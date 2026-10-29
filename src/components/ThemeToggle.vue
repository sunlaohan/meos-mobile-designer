<script setup lang="ts">
import { computed } from 'vue';
import { Moon, Sun } from 'lucide-vue-next';
import { useTheme } from '../utils/useTheme';
import { useI18n } from '../utils/i18n';

const props = defineProps<{ language?: 'zh' | 'en' }>();
const { language } = useI18n();
const { theme, toggleTheme } = useTheme();
const label = computed(() => (props.language || language.value) === 'en'
  ? `Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`
  : `切换到${theme.value === 'dark' ? '浅色' : '深色'}模式`);
</script>

<template>
  <button type="button" class="theme-toggle" :aria-label="label" :title="label" @click="toggleTheme">
    <Sun v-if="theme === 'dark'" :size="17" :stroke-width="1.7" />
    <Moon v-else :size="17" :stroke-width="1.7" />
  </button>
</template>
