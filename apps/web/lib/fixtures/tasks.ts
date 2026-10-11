/**
 * What the fixture tasks ask for, so the fake board and the /human list show
 * a mix of errands instead of only seat holds.
 *
 * The real server and voice agent only accept seat holds today (the server
 * returns 422 not_seat_hold for anything else). These are fixture data only.
 */
export interface FixtureErrand {
  /** What the caller asked for (the task). */
  description: string;
  /** What the local agent posts for a Helper (the sub-task). */
  subtaskDescription: string;
  place: string;
  /** The Helper's proof photo and note. */
  photoUrl: string;
  photoNote: string;
}

export const FIXTURE_ERRANDS = {
  seat: {
    description: "Save me a seat at the big table",
    subtaskDescription: "Save a seat at the big table",
    place: "Main Stacks, level C",
    photoUrl: "/fixtures/seat-photo.svg",
    photoNote: "Big table, the seat by the lamp",
  },
  twoSeats: {
    description: "Save me two seats together",
    subtaskDescription: "Save two seats together",
    place: "Kresge Engineering Library",
    photoUrl: "/fixtures/seat-photo.svg",
    photoNote: "Two seats at the window table",
  },
  beer: {
    description: "Bring me a cold beer",
    subtaskDescription: "Bring a cold beer to Memorial Glade",
    place: "Memorial Glade, by the big oak",
    photoUrl: "/fixtures/beer-photo.svg",
    photoNote: "Left it with you by the oak",
  },
  design: {
    description: "Choose the better of my two poster designs",
    subtaskDescription: "Pick the better of two poster designs, A or B",
    place: "Wurster Hall, 3rd floor studio",
    photoUrl: "/fixtures/design-choice.svg",
    photoNote: "B. The title reads from across the room",
  },
  essay: {
    description: "Edit my essay without AI",
    subtaskDescription: "Edit a two-page essay by hand, no AI",
    place: "Doe Library, North Reading Room",
    photoUrl: "/fixtures/essay-edits.svg",
    photoNote: "Marked up both pages in red pen",
  },
} as const satisfies Record<string, FixtureErrand>;

export type FixtureErrandName = keyof typeof FIXTURE_ERRANDS;

/** The order the live fixture stream cycles through. */
export const LIVE_ERRAND_ROTATION: readonly FixtureErrandName[] = ["seat", "beer", "design", "essay"];
