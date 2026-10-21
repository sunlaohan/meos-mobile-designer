<script setup lang="ts">
import * as Vue from 'vue';
import { computed } from 'vue';
import { PullRefresh, List, Sticky } from 'persagy-vant';
import type { CanvasNode } from '../types';
import { effectiveExtensions } from '../utils/containerExtensions';
import { createContainerExtensionRuntime } from '../../shared/container-extension-runtime.mjs';
const props = defineProps<{ node: CanvasNode; nodes?: CanvasNode[]; interactive: boolean }>();
const emit = defineEmits<{ (event: 'action', value: string): void }>();
const config = computed(() => effectiveExtensions(props.node, props.nodes || [props.node]));
const ContainerBehavior = createContainerExtensionRuntime({ ...Vue, PullRefresh, List, Sticky });
</script>
<template><ContainerBehavior :extensions="config" :interactive="interactive" @action="emit('action', $event)"><slot /></ContainerBehavior></template>
