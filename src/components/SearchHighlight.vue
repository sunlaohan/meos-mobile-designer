<script setup lang="ts">
import { computed } from 'vue';
import { highlightPanelSearch } from '../utils/panelSearch';

const props = defineProps<{ text: string; query: string }>();
const parts = computed(() => highlightPanelSearch(props.text, props.query));
</script>

<template>
  <span class="search-highlight"><template v-for="(part, index) in parts" :key="index"><mark v-if="part.matched" class="panel-search-match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
</template>
