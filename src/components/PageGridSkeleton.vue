<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 3 });
</script>

<template>
  <div class="design-skeleton-grid" aria-hidden="true">
    <div v-for="index in count" :key="index" class="design-skeleton-card">
      <div class="skeleton-block skeleton-card-preview" />
      <div class="skeleton-card-meta"><div class="skeleton-block skeleton-card-title" /><div class="skeleton-block skeleton-card-date" /></div>
    </div>
  </div>
</template>
