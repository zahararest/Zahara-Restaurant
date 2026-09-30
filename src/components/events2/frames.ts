// Frame parameters for the two-venue events page, in one place because TWO
// things must agree on them byte for byte: the <img>/<source> a component
// renders and the `rel=preload` the page puts in <head> for its LCP photo. A
// preload whose URL differs from the image by one digit is a second download,
// not a preload (see the same note in src/lib/photo.ts).

/** The opening doors. Half the screen wide on a desk while the visitor
 *  chooses; the whole screen once a venue is open — the page's script widens
 *  `sizes` to 100vw at that moment, so the open door fetches the bigger cut. */
export const DOOR_WIDTHS  = [640, 960, 1280, 1600, 2000, 2560] as const;
export const DOOR_SIZES   = '(min-width: 900px) 50vw, 100vw';
export const DOOR_SIZES_OPEN = '100vw';
/** Phones: a 4:5 cut serves both the half-screen door and the taller hero
 *  (object-fit trims whichever edge the frame doesn't need). Sourced from
 *  /photos-m, so an uploaded phone crop wins. */
export const DOOR_MOBILE  = [[640, 800], [828, 1035], [1080, 1350]] as const;
export const DOOR_QUALITY = 74;

/** Gallery frames: portrait 4:5, about a quarter of a desk, most of a phone. */
export const FRAME_WIDTHS = [420, 620, 840, 1100] as const;
export const FRAME_SIZES  = '(max-width: 600px) 76vw, (max-width: 1100px) 34vw, 22rem';

/** The photograph beside the form: half a desk wide, the full height. */
export const SIDE_WIDTHS  = [720, 1000, 1400, 1800] as const;
export const SIDE_SIZES   = '50vw';
