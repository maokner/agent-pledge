import Image from "next/image";

/**
 * "powered by:" with the Ripple and ElevenLabs logos (the official PNGs in
 * public/logos). The mockup shows both near-black, so `brightness-0` turns
 * the brand-colored Ripple logo monochrome; both keep their aspect ratio.
 */
export function PoweredBy() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 pb-8 sm:gap-x-4 sm:pb-12">
      <span className="text-sm text-landing-footer-fg sm:text-xl">powered by:</span>
      <Image
        src="/logos/ripple.png"
        alt="Ripple"
        width={960}
        height={277}
        className="h-6 w-auto brightness-0 sm:h-[1.875rem]"
      />
      <span aria-hidden className="h-6 w-px bg-landing-divider sm:h-8" />
      <Image
        src="/logos/elevenlabs.png"
        alt="ElevenLabs"
        width={694}
        height={90}
        className="h-4 w-auto brightness-0 sm:h-[1.3125rem]"
      />
    </footer>
  );
}
