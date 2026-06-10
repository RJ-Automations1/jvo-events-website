/**
 * Central manifest for site imagery/video. Update paths here once and every
 * page picks them up. Files live in /public/manus-storage and are served at
 * the matching URL.
 */

// Primary hero — the wide deck view (matches the look the owner wanted).
export const HERO_IMAGE = "/manus-storage/DSC00304-HDR.jpg";

/**
 * Homepage hero video background — one big outdoor tour: the covered deck
 * flowing into the grounds and pavilion (space-hero + the outdoor reel combined
 * into a single landscape loop). Silent, faststart; HERO_IMAGE is the poster.
 */
export const HERO_VIDEO = "/manus-storage/video/hero-outdoor.mp4";

// Secondary hero used on interior page headers.
export const PAGE_HERO_IMAGE = "/manus-storage/DSC00327-HDR.jpg";

// Brand logo (transparent PNG: "Jonesboro · Virtual Offices & Suites").
export const LOGO = "/manus-storage/jvo-logo.png";

// Edited promo/event videos pulled from the studio FINALS folder.
export const VIDEO = {
  outdoorReel: "/manus-storage/video/reel-outdoor.mp4",
  gameNight: "/manus-storage/video/game-night.mp4",
  cookup: "/manus-storage/video/cookup.mp4",
  testimonyMain: "/manus-storage/video/testimony-main.mp4",
  testimonyRoss: "/manus-storage/video/testimony-ross.mp4",
  cookupBg: "/manus-storage/video/cookup-bg.mp4",
  voiceGreen: "/manus-storage/video/testimonial-green.mp4",
  voiceYellow: "/manus-storage/video/testimonial-yellow.mp4",
  voiceSuit: "/manus-storage/video/testimonial-suit.mp4",
  igTestimonial1: "/manus-storage/video/ig-testimonial-1.mp4",
  igTestimonial2: "/manus-storage/video/ig-testimonial-2.mp4",
  igTestimonial3: "/manus-storage/video/ig-testimonial-3.mp4",
  wedding: "/manus-storage/video/wedding.mp4",
};

// Posters (still frames extracted from the videos) for each clip.
export const VIDEO_POSTER = {
  outdoorReel: "/manus-storage/video/reel-outdoor.jpg",
  gameNight: "/manus-storage/video/game-night.jpg",
  cookup: "/manus-storage/video/cookup.jpg",
  testimonyMain: "/manus-storage/video/testimony-main.jpg",
  testimonyRoss: "/manus-storage/video/testimony-ross.jpg",
  voiceGreen: "/manus-storage/video/testimonial-green.jpg",
  voiceYellow: "/manus-storage/video/testimonial-yellow.jpg",
  voiceSuit: "/manus-storage/video/testimonial-suit.jpg",
  igTestimonial1: "/manus-storage/video/ig-testimonial-1.jpg",
  igTestimonial2: "/manus-storage/video/ig-testimonial-2.jpg",
  igTestimonial3: "/manus-storage/video/ig-testimonial-3.jpg",
  wedding: "/manus-storage/video/wedding.jpg",
};

// Event reels (from Instagram) shown on the right half of the Gallery.
export const REELS: { src: string; poster: string }[] = Array.from(
  { length: 10 },
  (_, i) => ({
    src: `/manus-storage/video/reels/reel${i + 1}.mp4`,
    poster: `/manus-storage/video/reels/reel${i + 1}.jpg`,
  })
);

// Curated gallery selection — venue architecture mixed with real event moments.
export const GALLERY: { src: string; alt: string; span?: string }[] = [
  { src: "/manus-storage/DSC00352-HDR.jpg", alt: "The pavilion — main event space", span: "lg:col-span-2 lg:row-span-2" },
  { src: "/manus-storage/people-tables.jpg", alt: "Guests at game night" },
  { src: "/manus-storage/DSC00294-HDR.jpg", alt: "JVO Events entrance" },
  { src: "/manus-storage/people-smile.jpg", alt: "A guest enjoying the evening" },
  { src: "/manus-storage/DSC00322-HDR.jpg", alt: "Bar and serving area" },
  { src: "/manus-storage/people-ribbon.jpg", alt: "Ribbon-cutting celebration", span: "lg:col-span-2" },
  { src: "/manus-storage/DSC00277-HDR.jpg", alt: "Walkway to the pavilion" },
  { src: "/manus-storage/people-jenga.jpg", alt: "Game night fun" },
  { src: "/manus-storage/people-food.jpg", alt: "Food and catering" },
  { src: "/manus-storage/DSC00304-HDR.jpg", alt: "Open-air covered pavilion" },
  { src: "/manus-storage/people-games.jpg", alt: "Friends gathered around the table", span: "lg:col-span-2" },
  { src: "/manus-storage/DSC00342-HDR.jpg", alt: "Bar seating along the windows" },
  { src: "/manus-storage/DSC00223-HDR.jpg", alt: "The grounds" },
];
