import { useEffect, useRef, useState } from "react";

/**
 * 封面氛围色层。
 *
 * 把当前歌曲封面铺满视口后砸一层超大模糊，整屏底色因此跟着歌走。
 * 参考 Mineradio 的 #album-bg 做法，但参数按 Redio 的暖黑基调重调过。
 *
 * 两层交叉淡入：切歌时新封面淡入、旧封面淡出，避免 background-image
 * 直接替换导致的颜色跳变。纯 CSS 滤镜实现，不占 WebGL 资源，
 * 也不受图源 CORS 限制（background-image 无跨域读取问题）。
 */

type AmbientLayer = {
  /** 用自增 id 而非 url 作 key：同一首歌重复选中时也能触发一次淡入 */
  id: number;
  url: string;
};

export function AmbientTintLayer({ coverUrl }: { coverUrl?: string | null }) {
  // current 是正在显示的那层，previous 是正在淡出的上一层
  const [current, setCurrent] = useState<AmbientLayer | null>(null);
  const [previous, setPrevious] = useState<AmbientLayer | null>(null);
  const layerIdRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!coverUrl) {
      return;
    }

    // 同一张封面不重复触发过渡
    if (current?.url === coverUrl) {
      return;
    }

    let cancelled = false;
    // 先把图预加载完再切，否则会先闪一下空白再出现颜色
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) {
        return;
      }

      layerIdRef.current += 1;
      const nextLayer = { id: layerIdRef.current, url: coverUrl };

      setPrevious(current);
      setCurrent(nextLayer);

      // 淡出结束后卸掉旧层，避免层数累积
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }

      fadeTimerRef.current = window.setTimeout(() => {
        setPrevious(null);
        fadeTimerRef.current = null;
      }, 1400);
    };

    // 封面拉不到就保持当前颜色，不要闪回纯黑
    image.onerror = () => {};
    image.src = coverUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [coverUrl, current]);

  useEffect(
    () => () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    },
    []
  );

  // 亮度/饱和度/浓度由 .landingAmbientTint 的 CSS 变量控制，
  // 体验版的调参面板直接改根元素上的变量，无需经过 React。
  return (
    <>
      {previous ? (
        <div
          aria-hidden="true"
          className="landingAmbientTint isPrevious isVisible"
          key={`ambient-prev-${previous.id}`}
          style={{ backgroundImage: `url("${previous.url}")` }}
        />
      ) : null}
      {current ? (
        <div
          aria-hidden="true"
          className="landingAmbientTint isVisible"
          key={`ambient-${current.id}`}
          style={{ backgroundImage: `url("${current.url}")` }}
        />
      ) : null}
    </>
  );
}
