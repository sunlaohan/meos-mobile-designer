<script setup lang="ts">
withDefaults(defineProps<{ loading?: boolean; disabled?: boolean; type?: 'button' | 'submit' | 'reset' }>(), { loading: false, disabled: false, type: 'button' });
</script>

<template>
  <button class="async-button" :type="type" :disabled="disabled || loading" :aria-busy="loading">
    <span class="async-button-content"><slot /></span>
    <span v-if="loading" class="async-button-spinner" aria-hidden="true" />
  </button>
</template>
