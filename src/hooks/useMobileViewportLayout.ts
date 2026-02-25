import { useEffect, useRef, useState } from 'react';

declare global {
  interface WindowEventMap {
    'linkflow:android-insets': CustomEvent<{
      viewportHeight: number;
      topInset: number;
      bottomInset: number;
      keyboardInset: number;
      keyboardVisible: boolean;
    }>;
  }
}

interface MobileViewportLayout {
  isMobileViewport: boolean;
  keyboardInset: number;
  visibleHeight: number | null;
  viewportOffsetTop: number;
}

interface NativeInsetsSnapshot {
  active: boolean;
  viewportHeight: number;
  topInset: number;
  bottomInset: number;
  keyboardInset: number;
  keyboardVisible: boolean;
}

export function useMobileViewportLayout(): MobileViewportLayout {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null);
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0);
  const viewportBaseHeightRef = useRef<number | null>(null);
  const nativeInsetsRef = useRef<NativeInsetsSnapshot>({
    active: false,
    viewportHeight: 0,
    topInset: 0,
    bottomInset: 0,
    keyboardInset: 0,
    keyboardVisible: false,
  });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobileViewport(media.matches);

    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setKeyboardInset(0);
      setVisibleHeight(null);
      setViewportOffsetTop(0);
      viewportBaseHeightRef.current = null;
      nativeInsetsRef.current = {
        active: false,
        viewportHeight: 0,
        topInset: 0,
        bottomInset: 0,
        keyboardInset: 0,
        keyboardVisible: false,
      };
      return;
    }

    const onAndroidInsets = (
      event: WindowEventMap['linkflow:android-insets'],
    ) => {
      const detail = event.detail;
      const keyboardVisible = detail.keyboardVisible || detail.keyboardInset > 0;
      nativeInsetsRef.current = {
        active: true,
        viewportHeight: detail.viewportHeight,
        topInset: detail.topInset,
        bottomInset: detail.bottomInset,
        keyboardInset: detail.keyboardInset,
        keyboardVisible,
      };
    };

    const syncLayout = () => {
      const viewport = window.visualViewport;
      const currentHeight = Math.round(viewport?.height ?? window.innerHeight);
      const baseline = viewportBaseHeightRef.current ?? currentHeight;
      viewportBaseHeightRef.current = Math.max(baseline, currentHeight);

      const offsetTop = Math.round(viewport?.offsetTop ?? 0);
      const visualKeyboardInset = Math.max(0, viewportBaseHeightRef.current - currentHeight - offsetTop);
      const native = nativeInsetsRef.current;

      const resolvedTopInset = native.active ? native.topInset : offsetTop;
      const resolvedKeyboardInset = native.active
        ? Math.max(native.keyboardInset, visualKeyboardInset)
        : visualKeyboardInset;
      const resolvedKeyboardVisible =
        resolvedKeyboardInset > 0 || (native.active && native.keyboardVisible);
      const resolvedVisibleHeight = native.active
        ? Math.max(
            0,
            native.viewportHeight -
              (resolvedKeyboardVisible ? resolvedKeyboardInset : native.bottomInset),
          )
        : currentHeight;

      setVisibleHeight(resolvedVisibleHeight);
      setViewportOffsetTop(resolvedTopInset);
      setKeyboardInset(resolvedKeyboardInset);
    };

    window.addEventListener('linkflow:android-insets', onAndroidInsets);
    syncLayout();
    window.visualViewport?.addEventListener('resize', syncLayout);
    window.visualViewport?.addEventListener('scroll', syncLayout);
    window.addEventListener('resize', syncLayout);

    return () => {
      window.removeEventListener('linkflow:android-insets', onAndroidInsets);
      window.visualViewport?.removeEventListener('resize', syncLayout);
      window.visualViewport?.removeEventListener('scroll', syncLayout);
      window.removeEventListener('resize', syncLayout);
    };
  }, [isMobileViewport]);

  return {
    isMobileViewport,
    keyboardInset,
    visibleHeight,
    viewportOffsetTop,
  };
}
