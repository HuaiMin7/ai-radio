/**
 * 画廊卡片的 hover 倾斜内壳
 *
 * 算法移植自 reactbits TiltedCard：读鼠标在卡片内的相对位置 → 换算成 rotateX / rotateY，
 * 配 spring 缓动，离开时回正。
 *
 * 为什么要单独一层：
 * 画廊卡片的外层元素（.queueOrbitItem）的 transform 由弧线布局帧循环逐帧覆写
 * （平移 + 弧线旋转 + 缩放）。若把 hover 倾斜也写在外层，两者会互相抹掉。
 * 所以外层只管"卡片在弧上的位置"，这一层只管"卡片自身的倾斜"，职责隔离。
 */
import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import type { ReactNode } from "react";

type QueueCardTiltProps = {
  children: ReactNode;
  // 用取值函数而不是数值：调参面板改的是普通对象，不触发卡片重渲染，
  // 每次交互时现取才能让面板调整即时生效。
  readAmplitude: () => number;
  readHoverScale: () => number;
  // true 时抵消父卡片在弧线上的倾斜，让气泡文字保持水平；
  // false 则完全照 TiltedCard 原行为，气泡跟着卡片一起歪。
  readTooltipUpright: () => boolean;
  tooltip?: string;
};

// 与 TiltedCard 源码一致的 spring 参数（低刚度 + 双倍质量 = 明显惯性与追赶感）
const springValues = { damping: 30, mass: 2, stiffness: 100 };
const captionSpring = { damping: 30, mass: 1, stiffness: 350 };

// 源码是 300px 卡片配 800px 透视，比值 ≈ 2.67。
// 透视距离必须随卡片尺寸成比例缩放，否则小卡片用大透视 = 几乎没有立体感。
const PERSPECTIVE_RATIO = 800 / 300;

export function QueueCardTilt({
  children,
  readAmplitude,
  readHoverScale,
  readTooltipUpright,
  tooltip
}: QueueCardTiltProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  // 直接用数值初始化：若用 useSpring(useMotionValue(0)) 包一层源值，
  // spring 会持续追踪那个恒为 0 的源，和这里的 .set() 互相争夺，导致离开后回不了正。
  const rotateX = useSpring(0, springValues);
  const rotateY = useSpring(0, springValues);
  const scale = useSpring(1, springValues);
  // 气泡跟随鼠标：x / y 为鼠标在卡片内的坐标
  const captionX = useMotionValue(0);
  const captionY = useMotionValue(0);
  // 抵消父卡片缩放，保持气泡视觉尺寸恒定
  const captionScale = useMotionValue(1);
  const captionOpacity = useSpring(0);
  // 气泡甩动：由鼠标纵向移动速度驱动（源码 rotateFigcaption 的做法）
  const captionRotate = useSpring(0, captionSpring);
  const lastOffsetYRef = useRef(0);
  // 最近一次的纵向速度：气泡甩动量，鼠标停下后自然衰减回 0
  const lastVelocityRef = useRef(0);

  // 卡片尺寸是响应式的（clamp 随视口变），透视距离要跟着按比例走，
  // 才能让不同屏幕下的立体感保持一致。
  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const applyPerspective = () => {
      const size = shell.offsetWidth;

      if (size > 0) {
        shell.style.perspective = `${Math.round(size * PERSPECTIVE_RATIO)}px`;
      }
    };

    applyPerspective();
    const observer = new ResizeObserver(applyPerspective);
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  // 气泡的水平校正必须每帧跟随卡片角度：卡片在弧上的倾斜会随切歌不断变化，
  // 只在鼠标移动时算一次会留下过期的校正角（卡片转了、气泡还歪着）。
  useEffect(() => {
    let raf = 0;

    const syncUpright = () => {
      // 只在气泡可见时更新，避免无谓开销
      if (captionOpacity.get() > 0.01) {
        // 速度逐帧衰减：鼠标停下后甩动量归零，气泡回到纯水平
        lastVelocityRef.current *= 0.82;
        captionRotate.set(readUprightDeg() - lastVelocityRef.current * 0.6);
        // 中心卡被放大（centerScale），气泡会跟着一起放大。
        // 反向缩放抵消掉，保证大卡小卡的气泡看起来一样大。
        captionScale.set(readInverseScale());
      }

      raf = window.requestAnimationFrame(syncUpright);
    };

    raf = window.requestAnimationFrame(syncUpright);

    return () => window.cancelAnimationFrame(raf);
  }, []);

  // 父卡片的倾斜角由弧线帧循环逐帧写入，这里现读现用：
  // 取反后加到气泡自身的旋转上，即可抵消卡片倾斜、保持文字水平。
  function readUprightDeg() {
    const shell = shellRef.current;

    if (!shell || !readTooltipUpright()) {
      return 0;
    }

    const card = shell.closest(".queueOrbitItem");

    if (!card) {
      return 0;
    }

    const matrix = new DOMMatrixReadOnly(window.getComputedStyle(card).transform);

    return (-Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  }

  // 读取父卡片当前的缩放倍数，返回其倒数供气泡反向抵消。
  // 卡片缩放范围由弧线布局决定（中心卡最大），气泡不应随之变大变小。
  function readInverseScale() {
    const shell = shellRef.current;
    const card = shell?.closest(".queueOrbitItem");

    if (!card) {
      return 1;
    }

    const matrix = new DOMMatrixReadOnly(window.getComputedStyle(card).transform);
    const cardScale = Math.hypot(matrix.a, matrix.b);

    if (!Number.isFinite(cardScale) || cardScale < 0.05) {
      return 1;
    }

    return 1 / cardScale;
  }

  // 把屏幕坐标映射回元素自身未变换的局部坐标系。
  // 卡片带旋转/缩放时，(clientX - rect.left) 得到的是屏幕距离而非局部距离，
  // 必须用累积变换矩阵的逆矩阵还原，气泡才能真正贴着鼠标走。
  function toLocalPoint(element: HTMLElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const fallback = { x: clientX - rect.left, y: clientY - rect.top };

    if (width <= 0 || height <= 0) {
      return fallback;
    }

    // 缩放与旋转来自祖先 .queueOrbitItem（帧循环写在那一层），
    // 所以要沿祖先链把 transform 依次累积起来，而不是只看自己。
    let matrix = new DOMMatrixReadOnly();

    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const nodeTransform = window.getComputedStyle(node).transform;

      if (nodeTransform && nodeTransform !== "none") {
        matrix = new DOMMatrixReadOnly(nodeTransform).multiply(matrix);
      }

      if (node.classList.contains("queueOrbitTrack")) {
        break;
      }
    }

    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) {
      return fallback;
    }

    // 元素中心在屏幕上的位置就是包围盒中心（transform 以中心为原点时成立）
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    // 应用逆矩阵得到未变换坐标系下相对中心的偏移
    const localDx = (matrix.d * dx - matrix.c * dy) / determinant;
    const localDy = (matrix.a * dy - matrix.b * dx) / determinant;

    return { x: localDx + width / 2, y: localDy + height / 2 };
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const amplitude = readAmplitude();
    // 卡片被弧线帧循环旋转+缩放过，getBoundingClientRect 拿到的是变换后的屏幕包围盒。
    // 直接用它算局部坐标会随角度整体偏掉，所以映射回卡片自身的未变换坐标系。
    const local = toLocalPoint(shell, event.clientX, event.clientY);
    const width = shell.offsetWidth;
    const height = shell.offsetHeight;
    const offsetX = local.x - width / 2;
    const offsetY = local.y - height / 2;

    if (amplitude > 0) {
      rotateX.set((offsetY / (height / 2)) * -amplitude);
      rotateY.set((offsetX / (width / 2)) * amplitude);
    }

    // 气泡左上角钉在指针处（与源码一致的零偏移，紧跟鼠标）
    captionX.set(local.x);
    captionY.set(local.y);

    const velocityY = offsetY - lastOffsetYRef.current;
    lastVelocityRef.current = velocityY;
    captionRotate.set(readUprightDeg() - velocityY * 0.6);
    lastOffsetYRef.current = offsetY;
  }

  function handleMouseEnter() {
    scale.set(readHoverScale());
    // 先把反向缩放算好再显形，避免第一帧闪一下放大的气泡
    captionScale.set(readInverseScale());
    captionOpacity.set(1);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
    captionOpacity.set(0);
    captionRotate.set(readUprightDeg());
    captionScale.set(readInverseScale());
  }

  return (
    <div
      className="queueCardTiltRoot"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      ref={shellRef}
    >
      <motion.div className="queueCardTilt" style={{ rotateX, rotateY, scale }}>
        {children}
      </motion.div>

      {tooltip ? (
        <motion.span
          aria-hidden="true"
          className="queueCardCaption"
          style={{
            opacity: captionOpacity,
            rotate: captionRotate,
            scale: captionScale,
            x: captionX,
            y: captionY
          }}
        >
          {tooltip}
        </motion.span>
      ) : null}
    </div>
  );
}
