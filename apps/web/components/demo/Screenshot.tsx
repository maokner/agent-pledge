"use client";

import { X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import type { Shot } from "@/lib/demo/walkthrough";

/**
 * A screenshot from the run, framed as a browser window or a phone and
 * cropped from the top so the frames line up in a grid. Pressing it opens the
 * full image in a native <dialog> (Escape and the backdrop close it).
 */
export function Screenshot({
  shot,
  priority = false,
  className,
}: {
  shot: Shot;
  priority?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const phone = shot.frame === "phone";

  return (
    <figure className={cn("group/shot flex flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Open full size: ${shot.caption}`}
        className={cn(
          "relative block w-full cursor-zoom-in text-left outline-none transition-transform duration-300 ease-human",
          "focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-4 focus-visible:ring-offset-human-bg",
          "motion-safe:hover:-translate-y-1",
          phone ? "mx-auto max-w-[17rem] rounded-[2.4rem]" : "rounded-2xl",
        )}
      >
        {phone ? (
          <PhoneFrame shot={shot} priority={priority} />
        ) : (
          <BrowserFrame shot={shot} priority={priority} />
        )}
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-human-inverted/80 text-human-inverted-fg opacity-0 shadow-human-md backdrop-blur transition-opacity duration-200 group-hover/shot:opacity-100 group-focus-within/shot:opacity-100"
        >
          <ZoomIn className="size-4" />
        </span>
      </button>
      <figcaption className="text-sm leading-relaxed text-human-muted-fg">
        {shot.caption}
      </figcaption>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto max-h-[94dvh] w-[min(96vw,80rem)] max-w-none overflow-hidden rounded-2xl bg-human-card p-0 shadow-human-xl backdrop:bg-human-inverted/85 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[94dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-human-border px-5 py-3">
            <p className="text-base font-semibold">{shot.caption}</p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-full text-human-muted-fg outline-none transition-colors hover:bg-human-muted hover:text-human-fg focus-visible:ring-2 focus-visible:ring-human-ring"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 overflow-auto bg-human-muted p-4">
            <Image
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              sizes="96vw"
              className={cn(
                "mx-auto h-auto rounded-lg shadow-human-lg",
                phone ? "max-w-md" : "w-full",
              )}
            />
          </div>
        </div>
      </dialog>
    </figure>
  );
}

function BrowserFrame({ shot, priority }: { shot: Shot; priority: boolean }) {
  return (
    <span className="block overflow-hidden rounded-2xl border border-human-border bg-human-card shadow-human-lg transition-shadow duration-300 group-hover/shot:shadow-human-xl">
      <span className="flex h-9 items-center gap-1.5 border-b border-human-border bg-human-muted px-3">
        <span className="size-2.5 rounded-full bg-human-border" />
        <span className="size-2.5 rounded-full bg-human-border" />
        <span className="size-2.5 rounded-full bg-human-border" />
        {shot.location && (
          <span className="mx-auto hidden h-5 max-w-[60%] items-center truncate rounded-md bg-human-card px-3 text-[11px] text-human-muted-fg sm:flex">
            {shot.location}
          </span>
        )}
      </span>
      <span className="block aspect-[16/10] overflow-hidden">
        <Image
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          priority={priority}
          sizes="(min-width: 1024px) 640px, 100vw"
          className="size-full object-cover object-top"
        />
      </span>
    </span>
  );
}

function PhoneFrame({ shot, priority }: { shot: Shot; priority: boolean }) {
  return (
    <span className="block rounded-[2.4rem] bg-human-inverted p-2 shadow-human-xl transition-shadow duration-300 group-hover/shot:shadow-human-accent-lg">
      <span className="relative block aspect-[390/844] overflow-hidden rounded-[1.9rem] bg-human-card">
        <span
          aria-hidden="true"
          className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-human-inverted"
        />
        <Image
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          priority={priority}
          sizes="272px"
          className="size-full object-cover object-top"
        />
      </span>
    </span>
  );
}
