<script setup lang="ts">
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';

defineEmits<{ (event: 'cancel'): void }>();

const paused = ref(false);
const elapsed = ref(0);
const elapsedLabel = computed(() => `${String(Math.floor(elapsed.value / 60)).padStart(2, '0')}:${String(elapsed.value % 60).padStart(2, '0')}`);
const layers = [-1, 0, 1].map((y, layer) => ({
  y,
  delay: `${layer * 0.45}s`,
  cubes: [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => ({
    x, z, tracked: y === -1 && x === 1 && z === 1,
  }))),
}));
const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
let timer: number | undefined;
let motionPreference: MediaQueryList | undefined;

function followMotionPreference(event: MediaQueryListEvent) { paused.value = event.matches; }

onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  paused.value = motionPreference.matches;
  motionPreference.addEventListener('change', followMotionPreference);
  const started = Date.now();
  timer = window.setInterval(() => { elapsed.value = Math.floor((Date.now() - started) / 1000); }, 1000);
});

onBeforeUnmount(() => {
  window.clearInterval(timer);
  motionPreference?.removeEventListener('change', followMotionPreference);
});
</script>

<template>
  <div class="generation-loading" :class="{ 'generation-loading--paused': paused }" :aria-label="t('页面生成等待区')">
    <div class="kinetic-art" aria-hidden="true">
      <div class="kinetic-halo" />
      <div class="kinetic-floor" />
      <div class="kinetic-shadow" />
      <div class="kinetic-scene">
        <div class="kinetic-camera">
          <div class="kinetic-rotation">
            <div v-for="layer in layers" :key="layer.y" class="kinetic-layer" :style="{ '--layer-y': `${layer.y * 48}px`, '--layer-delay': layer.delay }">
              <div v-for="cube in layer.cubes" :key="`${cube.x}:${cube.z}`" class="kinetic-cubie" :class="{ 'kinetic-cubie--tracked': cube.tracked }" :style="{ '--x': cube.x, '--z': cube.z }">
                <div v-for="face in faces" :key="face" class="kinetic-face" :class="`kinetic-face--${face}`" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="generation-loading-copy" role="status" aria-live="polite">
      <h2>{{ t("正在构建你的页面") }}</h2>
      <p class="generation-loading-description">{{ t("正在根据你的描述组织组件，完成后会自动呈现。") }}</p>
    </div>
    <div class="generation-loading-actions">
      <button type="button" :aria-label="t('取消本次生成')" @click="$emit('cancel')"><X :size="13" />{{ t("取消生成") }}</button>
    </div>
    <p class="generation-loading-time" aria-live="off">{{ t("已等待") }} <span>{{ elapsedLabel }}</span><span class="generation-loading-preserve">{{ t("取消后保留原画板") }}</span></p>
  </div>
</template>

<style scoped>
.generation-loading { position: absolute; inset: 26px 0 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 20px; overflow: auto; text-align: center; background: radial-gradient(ellipse at 50% 42%, rgb(38 58 90 / 16%), transparent 58%); }
.kinetic-art { position: relative; width: 320px; height: 285px; flex: none; margin-top: -48px; }
.kinetic-halo { position: absolute; inset: 12px -20px 0; border-radius: 50%; background: radial-gradient(ellipse, rgb(74 126 227 / 12%), transparent 65%); }
.kinetic-floor { position: absolute; left: 50%; bottom: 8px; width: 258px; height: 82px; transform: translateX(-50%); border: 1px solid rgb(135 171 232 / 11%); border-radius: 50%; }
.kinetic-floor::after { content: ''; position: absolute; inset: 11px 28px; border: 1px solid rgb(135 171 232 / 7%); border-radius: 50%; }
.kinetic-shadow { position: absolute; left: 50%; bottom: 28px; width: 150px; height: 26px; margin-left: -75px; border-radius: 50%; background: #080d17; filter: blur(14px); animation: kinetic-shadow 12s ease-in-out infinite; }
.kinetic-scene { position: absolute; inset: 0; perspective: 850px; perspective-origin: 50% 42%; }
.kinetic-camera { position: absolute; left: 50%; top: 43%; transform-style: preserve-3d; transform: rotateX(-25deg) rotateY(-35deg); }
.kinetic-rotation { transform-style: preserve-3d; animation: kinetic-orbit 48s linear infinite; }
.kinetic-layer { position: absolute; transform-style: preserve-3d; transform: translateY(var(--layer-y)); animation: kinetic-layer-turn 12s cubic-bezier(.65, 0, .35, 1) infinite; animation-delay: var(--layer-delay); }
.kinetic-cubie { position: absolute; width: 40px; height: 40px; left: -20px; top: -20px; transform-style: preserve-3d; transform: translate3d(calc(var(--x) * 48px), 0, calc(var(--z) * 48px)); animation: kinetic-cubie-spread 12s cubic-bezier(.65, 0, .35, 1) infinite; animation-delay: var(--layer-delay); }
.kinetic-face { position: absolute; inset: 0; border: 1px solid rgb(207 230 255 / 30%); border-radius: 3px; backface-visibility: hidden; }
.kinetic-face::after { content: ''; position: absolute; inset: 3px; border: 1px solid rgb(224 239 255 / 10%); border-radius: 1px; }
.kinetic-face--front { transform: translateZ(20px); background: linear-gradient(145deg, #a2c7ff, #5386df); }
.kinetic-face--back { transform: rotateY(180deg) translateZ(20px); background: linear-gradient(145deg, #567ebd, #31568e); }
.kinetic-face--right { transform: rotateY(90deg) translateZ(20px); background: linear-gradient(145deg, #6a9aeb, #3a60ab); }
.kinetic-face--left { transform: rotateY(-90deg) translateZ(20px); background: linear-gradient(145deg, #86b0f4, #4778c4); }
.kinetic-face--top { transform: rotateX(90deg) translateZ(20px); background: linear-gradient(145deg, #e3efff, #9cbff4); }
.kinetic-face--bottom { transform: rotateX(-90deg) translateZ(20px); background: linear-gradient(145deg, #4a6eaa, #274477); }
.kinetic-cubie--tracked .kinetic-face--front, .kinetic-cubie--tracked .kinetic-face--back { background: linear-gradient(145deg, #d2fff4, #76d5cc); }
.kinetic-cubie--tracked .kinetic-face--left, .kinetic-cubie--tracked .kinetic-face--right { background: linear-gradient(145deg, #91e4dc, #4aa5a3); }
.kinetic-cubie--tracked .kinetic-face--top { background: linear-gradient(145deg, #edfff9, #b0f2e2); }
.generation-loading--paused .kinetic-art, .generation-loading--paused .kinetic-art * { animation-play-state: paused; }
.generation-loading-copy { position: relative; }
.generation-loading h2 { margin: 0; color: var(--text); font-size: 22px; font-weight: 600; letter-spacing: .035em; }
.generation-loading-description { max-width: 330px; margin: 12px 0 0; color: var(--text-2); font-size: 12px; line-height: 1.8; }
.generation-loading-actions { display: flex; align-items: center; margin-top: 20px; }
.generation-loading-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-2); font-size: 11px; cursor: pointer; }
.generation-loading-actions button:hover { background: rgb(145 175 222 / 9%); color: var(--text); }
.generation-loading-time { margin: 12px 0 0; color: var(--text-3); font-size: 10px; line-height: 1.8; }
.generation-loading-time > span:first-child { font-variant-numeric: tabular-nums; }
.generation-loading-preserve { margin-left: 12px; color: var(--text-3); }
@keyframes kinetic-orbit { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
@keyframes kinetic-layer-turn {
  0%, 8% { transform: translateY(var(--layer-y)) rotateY(0deg); }
  20%, 30% { transform: translateY(var(--layer-y)) rotateY(90deg); }
  42%, 52% { transform: translateY(var(--layer-y)) rotateY(180deg); }
  64%, 74% { transform: translateY(var(--layer-y)) rotateY(270deg); }
  86%, 100% { transform: translateY(var(--layer-y)) rotateY(360deg); }
}
@keyframes kinetic-cubie-spread {
  0%, 8%, 30%, 52%, 74%, 100% { transform: translate3d(calc(var(--x) * 48px), 0, calc(var(--z) * 48px)); }
  14%, 36%, 58%, 80% { transform: translate3d(calc(var(--x) * 64px), 0, calc(var(--z) * 64px)); }
  20%, 42%, 64%, 86% { transform: translate3d(calc(var(--x) * 48px), 0, calc(var(--z) * 48px)); }
}
@keyframes kinetic-shadow { 0%, 100% { transform: scaleX(.9); opacity: .75; } 36%, 80% { transform: scaleX(1.2); opacity: .5; } }
@media (max-height: 690px) { .kinetic-art { height: 245px; margin-top: 0; } .generation-loading { padding: 18px 12px; } .generation-loading-actions { margin-top: 10px; } }
</style>
