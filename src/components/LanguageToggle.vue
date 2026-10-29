<script setup lang="ts">
import { Globe2 } from 'lucide-vue-next';
import { useI18n } from '../utils/i18n';
const { language, setLanguage } = useI18n();
</script>
<template>
  <button type="button" class="language-toggle" :aria-label="language === 'zh' ? 'Switch to English' : '切换到中文'" :title="language === 'zh' ? 'Switch to English' : '切换到中文'" @click="setLanguage(language === 'zh' ? 'en' : 'zh')"><Globe2 :size="14" /><span>{{ language === 'zh' ? 'EN' : '中文' }}</span></button>
</template>
