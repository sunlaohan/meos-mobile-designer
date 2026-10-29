<script setup lang="ts">
import ThemeToggle from './components/ThemeToggle.vue';
import { useI18n } from './utils/i18n';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowRight, ArrowUpRight, Box, Check, ChevronDown, Circle, Cloud, Code2, Command, Expand, FileCode2, Globe2, Layers3, LayoutGrid, Menu, MousePointer2, Plus, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, WandSparkles, Workflow, X, Zap } from 'lucide-vue-next';
import ProductPreview from './marketing/ProductPreview.vue';
import { websiteCopy } from './marketing/content';
import './marketing/marketing.css';
import './marketing/themes.css';

const { language, setLanguage } = useI18n();
const copy = computed(() => websiteCopy[language.value]);
const menuOpen = ref(false);
const openFaq = ref(-1);
const selectedExample = ref<number | null>(null);
const closeExampleButton = ref<HTMLButtonElement>();
const dialog = ref<HTMLElement>();
const website = ref<HTMLElement>();
const loginHref = computed(() => `/login?lang=${language.value}`);
const signupHref = computed(() => `/login?register=1&lang=${language.value}`);
const navIds = ['workflow', 'showcase', 'features', 'faq'];
const galleryVariants = ['inspection', 'editor', 'form', 'detail', 'workspace', 'export'] as const;
const galleryIcons = [Smartphone, Layers3, SlidersHorizontal, Box, Cloud, Code2];
const featureIcons = [WandSparkles, Layers3, MousePointer2, Cloud, FileCode2, LayoutGrid];
const solutionIcons = [Workflow, Layers3, SlidersHorizontal, LayoutGrid, Box, ShieldCheck];
let observer: IntersectionObserver | undefined;
let frame = 0;
let returnFocus: HTMLElement | null = null;
let previousOverflow = '';

watch(language, (value) => {
  document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en';
  document.title = websiteCopy[value].metaTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', websiteCopy[value].metaDescription);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', websiteCopy[value].metaTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', websiteCopy[value].metaDescription);
  menuOpen.value = false;
}, { immediate: true });
function toggleLanguage() {
  setLanguage(language.value === 'zh' ? 'en' : 'zh');
}
function openExample(index: number, event: MouseEvent) {
  returnFocus = event.currentTarget as HTMLElement;
  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  selectedExample.value = index;
  void nextTick(() => closeExampleButton.value?.focus());
}
function closeExample() {
  selectedExample.value = null;
  document.documentElement.style.overflow = previousOverflow;
  returnFocus?.focus();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { menuOpen.value = false; if (selectedExample.value !== null) closeExample(); }
  if (event.key === 'Tab' && selectedExample.value !== null && dialog.value) {
    const items = Array.from(dialog.value.querySelectorAll<HTMLElement>('button,a[href]'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
function updateScroll() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    const progress = Math.min(window.scrollY / 1100, 1);
    website.value?.style.setProperty('--scroll-progress', String(progress));
    frame = 0;
  });
}
onMounted(() => {
  const elements = document.querySelectorAll('.mk-reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer?.unobserve(entry.target); } }), { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    elements.forEach(element => observer?.observe(element));
    document.documentElement.classList.add('mk-motion-ready');
  }
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();
});
onBeforeUnmount(() => {
  observer?.disconnect(); cancelAnimationFrame(frame);
  window.removeEventListener('keydown', onKeydown); window.removeEventListener('scroll', updateScroll);
  document.documentElement.classList.remove('mk-motion-ready');
  if (selectedExample.value !== null) document.documentElement.style.overflow = previousOverflow;
});
</script>

<template>
  <div ref="website" class="marketing-site" :class="`lang-${language}`">
    <a class="mk-skip-link" href="#main">{{ language === 'zh' ? '跳至主要内容' : 'Skip to content' }}</a>
    <header class="mk-header"><nav class="mk-nav" :aria-label="language === 'zh' ? '主导航' : 'Main navigation'">
      <a href="#top" class="mk-logo" aria-label="Compose">Compose<span class="mk-logo-dot">✦</span></a>
      <div class="mk-nav-links"><a v-for="(item,i) in copy.nav" :key="navIds[i]" :href="`#${navIds[i]}`">{{ item }}</a></div>
      <div class="mk-nav-actions"><ThemeToggle :language="language" /><button class="mk-language" :aria-label="copy.switchLanguage" @click="toggleLanguage"><Globe2 :size="14" /><span>{{ language === 'zh' ? 'EN' : '中文' }}</span></button><a :href="loginHref" class="mk-nav-cta">{{ copy.login }}<ArrowUpRight :size="14" /></a><button class="mk-menu-toggle" :aria-expanded="menuOpen" aria-controls="mobile-navigation" :aria-label="menuOpen ? copy.closeMenu : copy.menu" @click="menuOpen = !menuOpen"><X v-if="menuOpen" :size="20" /><Menu v-else :size="20" /></button></div>
      <div v-if="menuOpen" id="mobile-navigation" class="mk-mobile-menu"><a v-for="(item,i) in copy.nav" :key="navIds[i]" :href="`#${navIds[i]}`" @click="menuOpen=false">{{ item }}<ArrowUpRight :size="15" /></a><a :href="loginHref">{{ copy.login }}<ArrowRight :size="15" /></a></div>
    </nav></header>

    <main id="main">
      <section id="top" class="mk-hero">
        <div class="mk-hero-content"><div class="mk-badge mk-live-badge"><span class="mk-live-dot" />{{ copy.available }}</div>
          <h1><span>{{ copy.heroFirst }}<em>{{ copy.heroAccent }}</em></span><span>{{ copy.heroSecond }}</span></h1>
          <p class="mk-hero-description">{{ copy.heroDescription }}</p>
          <div class="mk-actions"><a class="mk-button mk-button-primary" :href="loginHref">{{ copy.start }}<ArrowUpRight :size="19" /></a><a class="mk-button mk-button-secondary" href="#workflow">{{ copy.explore }}<ArrowDown :size="18" /></a></div>
        </div>
        <a href="#foundation" class="mk-scroll-hint"><span>{{ copy.scroll }}</span><ArrowDown :size="14" /></a>
        <div class="mk-hero-wordmark" aria-hidden="true"><span>Compose</span><i>✦</i></div>
      </section>

      <section id="foundation" class="mk-foundation mk-container mk-reveal"><p class="mk-overline">{{ copy.foundation }}</p><div class="mk-foundation-logos"><span><span class="mk-vue-symbol">▽</span>Vue<span class="mk-logo-version">3</span></span><span><Box :size="24" />Persagy Vant</span><span><Sparkles :size="24" />AI<span class="mk-logo-version">Powered</span></span><span><Cloud :size="24" />Cloud<span class="mk-logo-version">Workspace</span></span></div></section>
      <section class="mk-manifesto mk-container mk-reveal"><div class="mk-manifesto-content"><span class="mk-overline">{{ copy.manifestoLabel }}</span><h2>{{ copy.manifesto }}</h2><p>{{ copy.manifestoDetail }}</p><a href="#workflow" class="mk-inline-link">{{ copy.explore }}<ArrowRight :size="16" /></a></div><div class="mk-manifesto-art" aria-hidden="true"><div class="mk-art-orbit orbit-one" /><div class="mk-art-orbit orbit-two" /><div class="mk-art-orbit orbit-three" /><span class="mk-art-symbol">C</span><span class="mk-art-spark spark-one">✦</span><span class="mk-art-spark spark-two">✦</span><span class="mk-art-label"><Sparkles :size="13" />Made for your next idea.</span></div></section>

      <section id="workflow" class="mk-section mk-panel-section mk-container"><div class="mk-section-heading mk-reveal"><span class="mk-badge">{{ copy.processLabel }}</span><h2>{{ copy.processTitle }}<em>{{ copy.processAccent }}</em></h2><p>{{ copy.processDescription }}</p></div><div class="mk-process-grid"><article v-for="(step,i) in copy.steps" :key="i" class="mk-process-step mk-reveal"><div class="mk-process-icon"><Sparkles v-if="i===0" :stroke-width="1" /><MousePointer2 v-else-if="i===1" :stroke-width="1" /><FileCode2 v-else :stroke-width="1" /><span>{{ String(i+1).padStart(2,'0') }}</span></div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></article></div><a class="mk-button mk-button-primary mk-reveal" :href="loginHref">{{ copy.start }}<ArrowUpRight :size="18" /></a></section>

      <section id="showcase" class="mk-showcase mk-section"><div class="mk-section-heading mk-container mk-reveal"><span class="mk-badge">{{ copy.galleryLabel }}</span><h2>{{ copy.galleryTitle }}<em>{{ copy.galleryAccent }}</em></h2><p>{{ copy.galleryDescription }}</p></div><div class="mk-gallery-perspective"><div class="mk-gallery-grid"><button v-for="(variant,i) in galleryVariants" :key="variant" class="mk-showcase-card" :class="`showcase-${variant}`" :aria-label="`${copy.viewExample}: ${copy.galleryCards[i]}`" @click="openExample(i,$event)"><ProductPreview :variant="variant" :copy="copy.preview" /><span class="mk-showcase-caption"><span><component :is="galleryIcons[i]" :size="15" />{{ copy.galleryCards[i] }}</span><Expand :size="17" /></span></button></div></div><p class="mk-gallery-note">{{ copy.galleryNote }}</p></section>

      <section id="benefits" class="mk-section mk-container"><div class="mk-section-heading mk-reveal"><span class="mk-badge">{{ copy.benefitsLabel }}</span><h2>{{ copy.benefitsTitle }}<em>{{ copy.benefitsAccent }}</em></h2><p>{{ copy.benefitsDescription }}</p></div><div class="mk-benefits-grid"><div class="mk-prompt-visual mk-reveal"><div class="mk-prompt-visual-top"><span class="mk-prompt-icon"><Sparkles :size="18" /></span><span>{{ copy.promptModel }}</span><i /><span class="mk-prompt-dots"><i /><i /><i /></span></div><div class="mk-prompt-bubble"><small>{{ copy.promptLabel }}</small><p>{{ copy.prompt }}</p><span><ArrowUpRight :size="17" /></span></div><div class="mk-prompt-result"><Check :size="13" />{{ copy.promptResult }}<span>✦</span></div><div class="mk-prompt-page"><ProductPreview variant="inspection" :copy="copy.preview" /></div><div class="mk-prompt-visual-bottom"><p>{{ copy.promptCta }}</p><span>Compose<span>✦</span></span></div></div><div class="mk-benefit-list"><article v-for="(item,i) in copy.benefitItems" :key="i" class="mk-reveal"><span class="mk-list-number">0{{ i+1 }}</span><h3>{{ item.title }}</h3><p>{{ item.description }}</p></article></div></div></section>

      <section id="features" class="mk-section mk-panel-section mk-container"><div class="mk-section-heading mk-reveal"><span class="mk-badge">{{ copy.featuresLabel }}</span><h2>{{ copy.featuresTitle }}<em>{{ copy.featuresAccent }}</em></h2><p>{{ copy.featuresDescription }}</p></div><div class="mk-feature-grid"><article v-for="(feature,i) in copy.features" :key="i" class="mk-feature-card mk-reveal"><div class="mk-feature-icon"><component :is="featureIcons[i]" :size="58" :stroke-width="1" /><span /></div><h3>{{ feature.title }}</h3><p>{{ feature.description }}</p></article></div><a :href="loginHref" class="mk-button mk-button-primary mk-reveal">{{ copy.start }}<ArrowUpRight :size="18" /></a></section>

      <section class="mk-section mk-solutions"><div class="mk-section-heading mk-container mk-reveal"><span class="mk-badge">{{ copy.solutionsLabel }}</span><h2>{{ copy.solutionsTitle }}<em>{{ copy.solutionsAccent }}</em></h2><p>{{ copy.solutionsDescription }}</p></div><div class="mk-marquee" v-for="row in 2" :key="row" :class="{ 'mk-marquee-reverse': row===2 }"><div class="mk-marquee-track"><div v-for="repeat in 2" :key="repeat" class="mk-marquee-group" :aria-hidden="repeat===2"><span v-for="(item,i) in copy.solutions.slice((row-1)*6,row*6)" :key="item" class="mk-solution-pill"><component :is="solutionIcons[i]" :size="22" :stroke-width="1.3" />{{ item }}</span></div></div></div></section>

      <section id="access" class="mk-section mk-container"><div class="mk-section-heading mk-reveal"><span class="mk-badge">{{ copy.accessLabel }}</span><h2>{{ copy.accessTitle }}<em>{{ copy.accessAccent }}</em></h2><p>{{ copy.accessDescription }}</p></div><div class="mk-access-card mk-reveal"><div class="mk-access-main"><span class="mk-badge mk-live-badge"><span class="mk-live-dot" />{{ copy.invite }}</span><h3>{{ copy.accessCardTitle }}</h3><p>{{ copy.accessCardDescription }}</p><div class="mk-access-actions"><a :href="signupHref" class="mk-button mk-button-primary">{{ copy.register }}<ArrowUpRight :size="17" /></a><a :href="loginHref" class="mk-access-login">{{ copy.hasAccount }}<ArrowRight :size="14" /></a></div><div class="mk-access-rule" /><ul><li v-for="item in copy.accessIncludes" :key="item"><span>✦</span>{{ item }}</li></ul><p class="mk-access-note"><ShieldCheck :size="14" />{{ copy.accessNote }}</p></div><div class="mk-access-art"><span class="mk-access-stamp">{{ copy.accessStamp }}</span><h3>{{ copy.accessAside }}</h3><div class="mk-access-sculpture" aria-hidden="true"><div /><div /><div /><div /><div /><div /><span>✦</span></div><p>{{ copy.accessAsideDetail }}</p><span class="mk-access-wordmark">Compose</span></div></div></section>

      <section id="faq" class="mk-faq-section mk-container"><div class="mk-section-heading mk-reveal"><span class="mk-badge">{{ copy.faqLabel }}</span><h2>{{ copy.faqTitle }}<em>{{ copy.faqAccent }}</em></h2></div><div class="mk-faq-list mk-reveal"><article v-for="(faq,i) in copy.faqs" :key="i" :class="{ 'mk-faq-open': openFaq===i }"><h3><button :aria-expanded="openFaq===i" :aria-controls="`faq-answer-${i}`" @click="openFaq=openFaq===i?-1:i"><span>{{ faq.question }}</span><Plus :size="21" :stroke-width="1.5" /></button></h3><div :id="`faq-answer-${i}`" class="mk-faq-answer" :inert="openFaq!==i ? true : undefined"><div><p>{{ faq.answer }}</p></div></div></article></div></section>
    </main>

    <footer class="mk-footer"><div class="mk-footer-cta mk-container mk-reveal"><span class="mk-badge mk-live-badge"><span class="mk-live-dot" />{{ copy.footerBadge }}</span><h2>{{ copy.footerTitle }}<em>{{ copy.footerAccent }}</em></h2><p>{{ copy.footerDescription }}</p><div class="mk-actions"><a :href="loginHref" class="mk-button mk-button-primary">{{ copy.start }}<ArrowUpRight :size="18" /></a><a href="#workflow" class="mk-button mk-button-secondary">{{ copy.footerSecondary }}<ArrowRight :size="17" /></a></div></div><div class="mk-footer-bottom mk-container"><div><a class="mk-logo" href="#top" aria-label="Compose">Compose<span class="mk-logo-dot">✦</span></a><p>{{ copy.footerTagline }}</p></div><nav :aria-label="language==='zh'?'页脚导航':'Footer navigation'"><a v-for="(item,i) in copy.nav" :key="navIds[i]" :href="`#${navIds[i]}`">{{ item }}</a><a :href="loginHref">{{ copy.login }}</a></nav></div><div class="mk-footer-copyright mk-container"><span>© {{ new Date().getFullYear() }} {{ copy.footerCopyright }}</span><a href="#top">{{ copy.backToTop }}<ArrowUpRight :size="13" /></a></div></footer>

    <div v-if="selectedExample!==null" class="mk-example-backdrop" @click.self="closeExample"><section ref="dialog" class="mk-example-dialog" role="dialog" aria-modal="true" aria-labelledby="example-title"><header><div><span class="mk-overline">{{ copy.preview.sample }}</span><h2 id="example-title">{{ copy.galleryCards[selectedExample] }}</h2></div><button ref="closeExampleButton" :aria-label="copy.closeExample" @click="closeExample"><X :size="22" /></button></header><ProductPreview :variant="galleryVariants[selectedExample]" :copy="copy.preview" large /><footer><p>{{ copy.galleryNote }}</p><a :href="loginHref" class="mk-button mk-button-primary">{{ copy.exampleAction }}<ArrowUpRight :size="17" /></a></footer></section></div>
  </div>
</template>
