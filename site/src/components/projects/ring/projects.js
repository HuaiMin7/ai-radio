// Ring order, not filename order. Art is dealt straight down this list, so
// entry n sits one slot along from n-1 and the column can count 01..18 as the
// carousel turns. Reordering these rows moves the ring, the column and the
// numbering together; nothing else needs touching.
//
// TODO: every `type` and `year` is placeholder. Names marked (*) are guesses
// at the subject — the artwork carries no wordmark to read them off.
export const PROJECTS = [
  { file: "10.webp", name: "Matchday", type: "Motion", year: "2025" }, // *
  { file: "12.webp", name: "Nightshift", type: "Art Direction", year: "2023" }, // *
  { file: "14.webp", name: "Volt", type: "Branding", year: "2024" }, // *
  { file: "16.webp", name: "Keycard", type: "Product Design", year: "2026" }, // *
  { file: "18.webp", name: "None", type: "Photography", year: "2026" },
  { file: "2.webp", name: "Prestige Equine", type: "Web Design", year: "2025" },
  { file: "4.webp", name: "Blue Room", type: "Identity", year: "2023" }, // *
  { file: "6.webp", name: "Steininvest", type: "Web Design", year: "2024" },
  { file: "8.webp", name: "CENE+", type: "Branding", year: "2026" },
  { file: "9.webp", name: "Snuff", type: "Editorial", year: "2024" },
  { file: "7.webp", name: "Iris", type: "Photography", year: "2023" }, // *
  { file: "5.webp", name: "Sevenworlds", type: "Development", year: "2025" },
  { file: "3.webp", name: "Irse a Volver", type: "Art Direction", year: "2024" },
  { file: "1.webp", name: "PM24", type: "Branding", year: "2024" },
  { file: "17.webp", name: "Favor", type: "E-commerce", year: "2025" },
  { file: "15.webp", name: "Freshweb", type: "Web Design", year: "2025" },
  { file: "13.webp", name: "Proba", type: "Development", year: "2026" },
  { file: "11.webp", name: "MVN", type: "Identity", year: "2025" },
];

export const IMAGE_FILES = PROJECTS.map((p) => p.file);
