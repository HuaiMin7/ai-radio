"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function DetailOverlay({ open, projectName, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    document.documentElement.classList.toggle("project-detail-open", open);
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    }
    if (!open && dialog.open) dialog.close();
    return () => document.documentElement.classList.remove("project-detail-open");
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const cancel = (event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="project-detail-dialog"
      aria-label={`${projectName || "项目"}详情`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="project-detail-glass" aria-hidden="true" />
      <article className="project-detail-card" aria-label="详情内容" />
      <button
        type="button"
        className="project-detail-close"
        aria-label="关闭详情"
        onClick={onClose}
      >
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5.21967 5.21967C5.51256 4.92678 5.98744 4.92678 6.28033 5.21967L12 10.9393L17.7197 5.21967C18.0126 4.92678 18.4874 4.92678 18.7803 5.21967C19.0732 5.51256 19.0732 5.98744 18.7803 6.28033L13.0607 12L18.7803 17.7197C19.0732 18.0126 19.0732 18.4874 18.7803 18.7803C18.4874 19.0732 18.0126 19.0732 17.7197 18.7803L12 13.0607L6.28033 18.7803C5.98744 19.0732 5.51256 19.0732 5.21967 18.7803C4.92678 18.4874 4.92678 18.0126 5.21967 17.7197L10.9393 12L5.21967 6.28033C4.92678 5.98744 4.92678 5.51256 5.21967 5.21967Z"
            fill="white"
          />
        </svg>
      </button>
    </dialog>,
    document.body,
  );
}
