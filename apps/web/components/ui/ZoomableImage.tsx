"use client";

/* eslint-disable @next/next/no-img-element -- images come from the API server (uploads), not this app */
import { useRef, useState } from "react";

/**
 * An image that opens full screen on tap or click, and closes on a second
 * tap, a click outside, or Escape. Shows a plain message if the image fails
 * to load, so a broken upload never breaks the board. With `fit`, the image
 * shrinks to fit the height its parent gives it (the projector layout, #43).
 */
export function ZoomableImage({ src, alt, className, fit = false }: { src: string; alt: string; className?: string; fit?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div className={`flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-600 ${className ?? ""}`}>
        Could not load the image.{" "}
        <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
          Open it
        </a>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 ${fit ? "h-full" : ""} ${className ?? ""}`}
        aria-label={`Enlarge: ${alt}`}
      >
        <img src={src} alt={alt} className={`block w-full ${fit ? "h-full object-contain" : ""}`} onError={() => setFailedSrc(src)} />
        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white opacity-80 group-hover:opacity-100">
          Click to enlarge
        </span>
      </button>
      <dialog
        ref={dialog}
        onClick={() => dialog.current?.close()}
        className="m-auto max-h-none max-w-none cursor-zoom-out bg-transparent p-0 backdrop:bg-black/85"
        aria-label={alt}
      >
        <img src={src} alt={alt} className="h-auto max-h-[92vh] w-[96vw] max-w-6xl rounded-lg object-contain" />
      </dialog>
    </>
  );
}
