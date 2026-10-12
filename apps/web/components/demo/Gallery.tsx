import { GALLERY } from "@/lib/demo/walkthrough";
import { SectionHeading } from "./parts";
import { Screenshot } from "./Screenshot";

/** Every screenshot from the run, in order, each one a tap from full size. */
export function Gallery() {
  return (
    <section
      id="gallery"
      aria-labelledby="gallery-title"
      className="scroll-mt-28 flex flex-col gap-10"
    >
      <SectionHeading
        id="gallery-title"
        badge="Screenshots"
        title={
          <>
            The board and the phone, <span className="text-human-gradient">as it happened</span>
          </>
        }
        lede="Taken during the run, in order. Tap any one to see it full size."
      />
      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
        {GALLERY.map((shot) => (
          <Screenshot key={shot.src} shot={shot} />
        ))}
      </div>
    </section>
  );
}
