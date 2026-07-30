"use client";
import React, { useEffect, useRef } from "react";

/**
 * 参考 clouarchitects.com 的自定义光标：
 * - 一个 fixed 的圆，JS 平滑跟随鼠标（lerp，带轻微拖尾）
 * - mix-blend-mode: difference → 圆盖住的区域颜色反相（白变黑、黑变白）
 * - hover 可点击元素时圆放大（data-cursor="link" 触发）
 */
export const CustomCursor = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  // 目标位置（真实鼠标）与当前位置（渲染，做 lerp 平滑）
  const target = useRef({ x: -100, y: -100 });
  const pos = useRef({ x: -100, y: -100 });
  const raf = useRef<number | null>(null);
  const hovering = useRef(false);

  useEffect(() => {
    // 仅在真正的触摸设备上禁用（hover:none 且有触摸点）；
    // 单纯桌面鼠标环境即使被报 hover:none 也照常显示。
    const isTouch =
      window.matchMedia("(hover: none)").matches && navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    };

    // 经过带 data-cursor="link" 的元素时放大
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('[data-cursor="link"]');
      hovering.current = !!el;
    };

    const render = () => {
      // 参考他们的 GSAP quickTo(power3.out) 手感：
      // 用「基于时间的指数平滑」而非固定比例 lerp，得到快速启动+柔和减速的缓动尾巴。
      // smoothing 越小跟得越紧；0.14 接近 GSAP duration≈0.5 + power3.out 的观感。
      const smoothing = 0.14;
      pos.current.x += (target.current.x - pos.current.x) * smoothing;
      pos.current.y += (target.current.y - pos.current.y) * smoothing;
      const dot = dotRef.current;
      if (dot) {
        const scale = hovering.current ? 0.5 : 1;
        dot.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      }
      raf.current = requestAnimationFrame(render);
    };

    document.body.classList.add("has-custom-cursor");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    raf.current = requestAnimationFrame(render);

    return () => {
      document.body.classList.remove("has-custom-cursor");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      className="custom-cursor"
    />
  );
};
