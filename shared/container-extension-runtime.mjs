// Self-contained factory: the designer and exported Vue SFC use the same runtime.
// Keep all dependencies explicit so the factory can be embedded in a standalone export.
export function createContainerExtensionRuntime({ defineComponent, h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, resolveComponent, PullRefresh, List, Sticky }) {
  return defineComponent({
    name: 'ContainerBehavior',
    props: { extensions: { type: Object, default: () => ({}) }, interactive: { type: Boolean, default: true }, simulate: { type: Boolean, default: true } },
    emits: ['refresh', 'load', 'action'],
    setup(props, { slots, emit }) {
      const refreshing = ref(false), loading = ref(false), finished = ref(false), error = ref(false), refreshFailed = ref(false);
      const lazyRoot = ref(), stickyHost = ref();
      const visible = ref(false), lazyShown = ref(false), phone = ref(null);
      const active = (kind) => props.interactive && props.extensions[kind]?.enabled !== false && !!props.extensions[kind];
      const options = (kind) => props.extensions[kind]?.props || {};
      const listFinished = computed(() => finished.value || options('list').finished === true);
      let observer, resizeObserver, disposed = false, request = 0;
      let mouseSession, suppressClick = false, clickTimer;
      const timers = new Set();
      function clearTimers() { for (const timer of timers) clearTimeout(timer); timers.clear(); }
      // PullRefresh is touch-based. Forward desktop mouse drags to its native
      // touch handlers so web preview uses the same threshold, easing and status UI.
      function touchEvent(session, type, point) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: point.clientX, clientY: point.clientY }] });
        session.track.dispatchEvent(event);
      }
      function stopMouse(cancel = false, point = mouseSession?.last) {
        const session = mouseSession;
        mouseSession = undefined;
        window.removeEventListener('pointermove', moveMouse);
        window.removeEventListener('pointerup', endMouse);
        window.removeEventListener('pointercancel', cancelMouse);
        window.removeEventListener('blur', cancelMouse);
        window.removeEventListener('keydown', escapeMouse);
        if (!session) return;
        if (cancel) touchEvent(session, 'touchmove', session.start);
        touchEvent(session, 'touchend', point || session.start);
        if (session.dragging) {
          suppressClick = true;
          clearTimeout(clickTimer);
          clickTimer = setTimeout(() => { suppressClick = false; }, 0);
        }
      }
      function moveMouse(event) {
        if (!mouseSession || event.pointerId !== mouseSession.id) return;
        if (event.buttons === 0) { stopMouse(false, event); return; }
        const session = mouseSession;
        session.last = event;
        const distance = event.clientY - session.start.clientY;
        if (distance > 8 && distance > Math.abs(event.clientX - session.start.clientX)) session.dragging = true;
        if (session.dragging && event.cancelable) event.preventDefault();
        touchEvent(session, 'touchmove', event);
      }
      function endMouse(event) { if (mouseSession?.id === event.pointerId) stopMouse(false, event); }
      function cancelMouse() { stopMouse(true); }
      function escapeMouse(event) { if (event.key === 'Escape') stopMouse(true); }
      function startMouse(event) {
        if (event.pointerType !== 'mouse' || event.button !== 0 || refreshing.value || event.target.closest('input, textarea, select, button, a')) return;
        let parent = event.currentTarget.parentElement;
        while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
        if ((parent ? parent.scrollTop : window.scrollY || 0) > 0) return;
        const track = event.currentTarget.querySelector('.van-pull-refresh__track');
        if (!track) return;
        stopMouse(true); clearTimeout(clickTimer); suppressClick = false;
        mouseSession = { id: event.pointerId, track, start: event, last: event, dragging: false };
        touchEvent(mouseSession, 'touchstart', event);
        window.addEventListener('pointermove', moveMouse, { passive: false });
        window.addEventListener('pointerup', endMouse);
        window.addEventListener('pointercancel', cancelMouse);
        window.addEventListener('blur', cancelMouse);
        window.addEventListener('keydown', escapeMouse);
      }
      function perform(kind) {
        if (disposed) return;
        if (kind === 'refresh') { clearTimers(); refreshFailed.value = false; refreshing.value = true; loading.value = true; error.value = false; }
        else { loading.value = true; error.value = false; }
        const token = ++request;
        let settled = false;
        const control = {
          complete(result = {}) {
            if (disposed || token !== request || settled) return;
            settled = true;
            if (kind === 'refresh') { refreshing.value = false; finished.value = false; }
            else finished.value = result.finished === true;
            loading.value = false;
          },
          fail() {
            if (disposed || token !== request || settled) return;
            settled = true; refreshFailed.value = kind === 'refresh'; refreshing.value = false; loading.value = false;
            // List exposes its native retry state; refresh failures must not show success.
            if (kind === 'load') error.value = true;
            emit('action', kind === 'refresh' ? '刷新失败，请重试' : '加载失败，可点击提示重试');
          },
        };
        emit(kind, control);
        if (props.simulate) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            if (disposed || token !== request) return;
            control.complete({ finished: kind === 'load' });
            emit('action', kind === 'refresh' ? '刷新完成（本地预览，数据接口待接入）' : '加载演示完成（未请求业务数据）');
          }, 650);
          timers.add(timer);
        }
      }
      function measurePhone() {
        const content = stickyHost.value?.closest('.phone-content');
        const frame = content?.closest('.phone-frame');
        if (!content || !frame) { if (phone.value) phone.value = null; return; }
        const box = content.getBoundingClientRect(), frameBox = frame.getBoundingClientRect();
        const scale = frameBox.width / frame.offsetWidth || 1;
        const css = getComputedStyle(frame);
        const top = parseFloat(css.getPropertyValue('--phone-top-fixed-height')) || 0;
        const bottom = parseFloat(css.getPropertyValue('--phone-fixed-height')) || 0;
        const state = { top: box.top + top * scale, bottom: window.innerHeight - box.bottom + bottom * scale, localTop: (box.top - frameBox.top) / scale + top, localBottom: (frameBox.bottom - box.bottom) / scale + bottom, scale };
        if (JSON.stringify(phone.value) !== JSON.stringify(state)) phone.value = state;
      }
      function observeLazy() {
        observer?.disconnect();
        if (!active('lazyload') || visible.value || !lazyRoot.value) return;
        if (typeof IntersectionObserver === 'undefined') { visible.value = true; return; }
        let root = lazyRoot.value.parentElement;
        while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) { visible.value = true; observer.disconnect(); }
        }, { root: root || null });
        observer.observe(lazyRoot.value);
      }
      onMounted(() => {
        observeLazy(); measurePhone();
        if (!active('sticky')) return;
        if (typeof ResizeObserver !== 'undefined' && stickyHost.value) {
          resizeObserver = new ResizeObserver(measurePhone);
          resizeObserver.observe(stickyHost.value);
          const content = stickyHost.value.closest('.phone-content');
          if (content) resizeObserver.observe(content);
        }
        window.addEventListener('resize', measurePhone);
        window.addEventListener('scroll', measurePhone, true);
      });
      watch(() => JSON.stringify([props.interactive, props.extensions]), async () => {
        request++; clearTimers(); refreshing.value = false; loading.value = false; finished.value = false; error.value = false;
        await nextTick(); observeLazy(); measurePhone();
      });
      onBeforeUnmount(() => {
        disposed = true; request++; stopMouse(true); clearTimeout(clickTimer); clearTimers(); observer?.disconnect(); resizeObserver?.disconnect();
        window.removeEventListener('resize', measurePhone);
        window.removeEventListener('scroll', measurePhone, true);
      });
      function renderList() {
        if (!active('list')) return slots.default?.();
        return h(List, { ...options('list'), 'data-container-extension': 'list', loading: loading.value, finished: listFinished.value, error: error.value,
          'onUpdate:loading': (value) => { loading.value = value; }, 'onUpdate:error': (value) => { error.value = value; }, onLoad: () => perform('load') }, { default: slots.default });
      }
      function renderRefresh() {
        if (!active('pull-refresh')) return renderList();
        return h(PullRefresh, { ...options('pull-refresh'), successText: refreshFailed.value ? '' : options('pull-refresh').successText, 'data-container-extension': 'pull-refresh', modelValue: refreshing.value,
          'onUpdate:modelValue': (value) => { refreshing.value = value; }, onRefresh: () => perform('refresh'), onPointerdown: startMouse,
          onClickCapture: (event) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } } }, { default: renderList });
      }
      function renderSticky() {
        if (!active('sticky')) return renderRefresh();
        const config = options('sticky');
        const offsetTop = Number(config.offsetTop) || 0, offsetBottom = Number(config.offsetBottom) || 0;
        return h('div', { ref: stickyHost, class: 'container-extension-sticky-host', 'data-container-extension': 'sticky', 'data-phone': !!phone.value, 'data-position': config.position || 'top', style: {
          '--container-sticky-top': `${(phone.value?.localTop || 0) + offsetTop}px`, '--container-sticky-bottom': `${(phone.value?.localBottom || 0) + offsetBottom}px`,
        } }, [h(Sticky, { ...config, offsetTop: phone.value ? phone.value.top + offsetTop * phone.value.scale : offsetTop, offsetBottom: phone.value ? phone.value.bottom + offsetBottom * phone.value.scale : offsetBottom, onScroll: measurePhone }, { default: renderRefresh })]);
      }
      return () => {
        if (!props.interactive) return slots.default?.();
        if (!active('lazyload')) return renderSticky();
        const minHeight = `${Math.max(1, Number(options('lazyload').placeholderHeight) || 160)}px`;
        return h('div', { ref: lazyRoot, class: 'container-extension-lazy', 'data-container-extension': 'lazyload', 'data-lazy-loaded': lazyShown.value, style: lazyShown.value ? undefined : { minHeight } }, [
          visible.value ? h(resolveComponent('LazyComponent'), { onShow: () => { lazyShown.value = true; nextTick(measurePhone); } }, { default: renderSticky }) : h('div', { class: 'container-extension-placeholder', style: { minHeight }, 'aria-label': '内容待进入可视区加载' }, '滚动至此加载内容'),
        ]);
      };
    },
  });
}
