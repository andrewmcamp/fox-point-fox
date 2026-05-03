// Fox of Fox Point — contestant data + SVG portrait placeholders
// Each "fox" is actually a dog. Portraits are stylized vector placeholders.

// Build a stylized dog/fox portrait as a data URI.
// Each portrait is built from the same primitives but parameterized for variety.
function makePortrait({ bg, coat, accent, ear, eye, snout, name, breed }) {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="bg-${name.replace(/\W/g,'')}" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${bg.light}"/>
      <stop offset="100%" stop-color="${bg.dark}"/>
    </radialGradient>
    <linearGradient id="coat-${name.replace(/\W/g,'')}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${coat.light}"/>
      <stop offset="100%" stop-color="${coat.dark}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#bg-${name.replace(/\W/g,'')})"/>
  <!-- subtle grain -->
  <g opacity="0.08">
    <circle cx="40" cy="60" r="1" fill="#000"/>
    <circle cx="120" cy="30" r="1" fill="#000"/>
    <circle cx="170" cy="90" r="1" fill="#000"/>
    <circle cx="60" cy="140" r="1" fill="#000"/>
    <circle cx="150" cy="170" r="1" fill="#000"/>
  </g>

  <!-- body suggestion -->
  <ellipse cx="100" cy="220" rx="90" ry="70" fill="${coat.dark}" opacity="0.6"/>

  <!-- ears -->
  ${ear === 'pointy' ? `
    <path d="M50 70 L60 25 L85 60 Z" fill="${coat.dark}"/>
    <path d="M150 70 L140 25 L115 60 Z" fill="${coat.dark}"/>
    <path d="M58 60 L62 35 L78 58 Z" fill="${accent}"/>
    <path d="M142 60 L138 35 L122 58 Z" fill="${accent}"/>
  ` : ear === 'floppy' ? `
    <path d="M55 65 Q40 90 50 130 Q70 120 75 80 Z" fill="${coat.dark}"/>
    <path d="M145 65 Q160 90 150 130 Q130 120 125 80 Z" fill="${coat.dark}"/>
  ` : ear === 'perky' ? `
    <ellipse cx="65" cy="55" rx="14" ry="22" fill="${coat.dark}" transform="rotate(-15 65 55)"/>
    <ellipse cx="135" cy="55" rx="14" ry="22" fill="${coat.dark}" transform="rotate(15 135 55)"/>
    <ellipse cx="66" cy="58" rx="7" ry="14" fill="${accent}" transform="rotate(-15 66 58)"/>
    <ellipse cx="134" cy="58" rx="7" ry="14" fill="${accent}" transform="rotate(15 134 58)"/>
  ` : `
    <path d="M55 75 Q45 60 60 50 Q75 55 78 75 Z" fill="${coat.dark}"/>
    <path d="M145 75 Q155 60 140 50 Q125 55 122 75 Z" fill="${coat.dark}"/>
  `}

  <!-- head -->
  <ellipse cx="100" cy="105" rx="55" ry="52" fill="url(#coat-${name.replace(/\W/g,'')})"/>

  <!-- cheek tufts -->
  <ellipse cx="62" cy="118" rx="14" ry="20" fill="${coat.light}" opacity="0.7"/>
  <ellipse cx="138" cy="118" rx="14" ry="20" fill="${coat.light}" opacity="0.7"/>

  <!-- forehead blaze -->
  ${snout === 'blaze' ? `<path d="M100 60 Q92 90 96 130 Q100 135 104 130 Q108 90 100 60 Z" fill="${coat.light}" opacity="0.8"/>` : ''}

  <!-- snout -->
  <ellipse cx="100" cy="135" rx="22" ry="18" fill="${coat.light}"/>
  ${snout === 'dark' ? `<ellipse cx="100" cy="138" rx="20" ry="14" fill="${coat.dark}" opacity="0.5"/>` : ''}

  <!-- nose -->
  <ellipse cx="100" cy="125" rx="7" ry="5" fill="#1c1814"/>
  <ellipse cx="98" cy="123" rx="2" ry="1.5" fill="#fbf5e4" opacity="0.5"/>

  <!-- mouth -->
  <path d="M100 132 Q100 142 92 144" stroke="#1c1814" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M100 132 Q100 142 108 144" stroke="#1c1814" stroke-width="1.5" fill="none" stroke-linecap="round"/>

  <!-- eyes -->
  ${eye === 'round' ? `
    <circle cx="78" cy="100" r="7" fill="#1c1814"/>
    <circle cx="122" cy="100" r="7" fill="#1c1814"/>
    <circle cx="80" cy="98" r="2" fill="#fbf5e4"/>
    <circle cx="124" cy="98" r="2" fill="#fbf5e4"/>
  ` : eye === 'sleepy' ? `
    <path d="M70 100 Q78 96 86 100" stroke="#1c1814" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M114 100 Q122 96 130 100" stroke="#1c1814" stroke-width="3" fill="none" stroke-linecap="round"/>
  ` : eye === 'almond' ? `
    <ellipse cx="78" cy="100" rx="8" ry="5" fill="#1c1814"/>
    <ellipse cx="122" cy="100" rx="8" ry="5" fill="#1c1814"/>
    <circle cx="80" cy="99" r="1.5" fill="#fbf5e4"/>
    <circle cx="124" cy="99" r="1.5" fill="#fbf5e4"/>
  ` : `
    <ellipse cx="78" cy="100" rx="6" ry="7" fill="#1c1814"/>
    <ellipse cx="122" cy="100" rx="6" ry="7" fill="#1c1814"/>
    <ellipse cx="78" cy="98" rx="2" ry="3" fill="#fbf5e4"/>
    <ellipse cx="122" cy="98" rx="2" ry="3" fill="#fbf5e4"/>
  `}

  <!-- eyebrow tufts -->
  <path d="M70 88 Q78 84 88 88" stroke="${coat.dark}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M112 88 Q122 84 130 88" stroke="${coat.dark}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>

  <!-- whiskers -->
  <line x1="70" y1="135" x2="55" y2="138" stroke="#1c1814" stroke-width="0.8" opacity="0.5"/>
  <line x1="70" y1="138" x2="58" y2="142" stroke="#1c1814" stroke-width="0.8" opacity="0.5"/>
  <line x1="130" y1="135" x2="145" y2="138" stroke="#1c1814" stroke-width="0.8" opacity="0.5"/>
  <line x1="130" y1="138" x2="142" y2="142" stroke="#1c1814" stroke-width="0.8" opacity="0.5"/>
</svg>`.trim();
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Color palettes for variety
const palettes = {
  rust:   { bg: { light: "#f0c590", dark: "#c2451f" }, coat: { light: "#f4d4a8", dark: "#a0521e" }, accent: "#5c2510" },
  cream:  { bg: { light: "#f4ecd8", dark: "#c4a974" }, coat: { light: "#f8eed4", dark: "#a08864" }, accent: "#6b5e4d" },
  charcoal:{ bg: { light: "#a8a094", dark: "#4a423a" }, coat: { light: "#7a7268" , dark: "#2d2820" }, accent: "#1c1814" },
  ginger: { bg: { light: "#f3a86a", dark: "#a8421e" }, coat: { light: "#f0b87a", dark: "#8c3812" }, accent: "#3a1408" },
  silver: { bg: { light: "#d8d4c8", dark: "#8a8478" }, coat: { light: "#e0dccc", dark: "#6c6458" }, accent: "#2a2520" },
  honey:  { bg: { light: "#f0d088", dark: "#a87838" }, coat: { light: "#e8c478", dark: "#80582a" }, accent: "#3c2410" },
  chocolate: { bg: { light: "#a88060", dark: "#5a3a20" }, coat: { light: "#7a5430", dark: "#3a2410" }, accent: "#1a0e08" },
  red:    { bg: { light: "#e89860", dark: "#9a3010" }, coat: { light: "#d8783c", dark: "#7a2810" }, accent: "#3a1208" },
  white:  { bg: { light: "#fbf5e4", dark: "#d4ccb4" }, coat: { light: "#fff8e8", dark: "#b4ac98" }, accent: "#6b5e4d" },
  blackt: { bg: { light: "#807868" , dark: "#3a342a" }, coat: { light: "#5a5048", dark: "#1c1814" }, accent: "#000000" },
  apricot:{ bg: { light: "#f4cca0", dark: "#c48a4c" }, coat: { light: "#eab880", dark: "#a06c2c" }, accent: "#5a3010" },
  smoke:  { bg: { light: "#9c9488" , dark: "#4c4438" }, coat: { light: "#807a70", dark: "#3a342a" }, accent: "#1c1814" },
};

const FP_STREETS = ["Wickenden St.", "Ives St.", "Benefit St.", "Brook St.", "Transit St.", "Hope St.", "Power St.", "Williams St.", "Sheldon St.", "John St.", "Governor St.", "Arnold St."];

const RAW = [
  { id: "rufus",     name: "Rufus the Magnificent", breed: "Shiba Inu",            owner: "The Mendes Family", street: "Wickenden St.", votes: 847, age: 4,  joined: "Mar 14",
    quote: "Posts up at the Coffee Exchange every morning. Disapproves of skateboards.",
    platform: ["Free belly rubs at India Point Park, Saturdays", "Resolution: more squirrels", "Will not run for a second term"],
    palette: "rust", ear: "pointy", eye: "almond", snout: "blaze",
    photos: ["on the porch", "Ives Street, sunset", "post-bath, furious"] },
  { id: "biscuit",   name: "Biscuit",               breed: "Pomeranian",           owner: "M. Tavares",        street: "Brook St.",     votes: 812, age: 6,  joined: "Mar 12",
    quote: "Looks like a fox. Moves like a fox. Is, in fact, a small dog.",
    platform: ["A bench at Fox Point Boys & Girls Club", "Better treats at the post office", "Ban leaf blowers"],
    palette: "ginger", ear: "perky", eye: "round", snout: "blaze",
    photos: ["snow day", "with a leaf", "guarding the stoop"] },
  { id: "winnie",    name: "Winifred 'Winnie' Coelho", breed: "Finnish Spitz",      owner: "The Coelhos",       street: "Transit St.",   votes: 731, age: 3,  joined: "Mar 16",
    quote: "Genuinely confused for a fox by tourists, twice weekly.",
    platform: ["Designate hydrants as historic landmarks", "Quieter fireworks", "More cheese"],
    palette: "rust", ear: "pointy", eye: "almond", snout: "" },
  { id: "duarte",    name: "Sir Duarte",            breed: "Pembroke Welsh Corgi", owner: "J. Almeida",        street: "Sheldon St.",   votes: 689, age: 5,  joined: "Mar 11",
    quote: "Short. Decisive. Has opinions about gulls.",
    platform: ["Lower curbs", "Establish a Gull Containment Zone at India Pt", "Free water bowls citywide"],
    palette: "honey", ear: "perky", eye: "round", snout: "blaze" },
  { id: "louie",     name: "Louie da Silva",        breed: "Long-haired Dachshund",owner: "P. da Silva",       street: "Williams St.",  votes: 642, age: 7,  joined: "Mar 10",
    quote: "Low to the ground, high in spirit. The people's hot dog.",
    platform: ["A ramp at every step", "Outlaw raccoons", "Annual sausage festival"],
    palette: "chocolate", ear: "floppy", eye: "almond", snout: "" },
  { id: "olive",     name: "Olive",                  breed: "Cavalier × Poodle",   owner: "S. Andrade",        street: "Power St.",     votes: 588, age: 2,  joined: "Mar 18",
    quote: "Greets strangers like long-lost cousins. Romantic.",
    platform: ["Free hugs (paw-administered)", "More public benches", "Soft music in the park"],
    palette: "apricot", ear: "floppy", eye: "round", snout: "" },
  { id: "moose",     name: "Moose",                  breed: "Mini Australian Shepherd", owner: "K. Pereira",   street: "Ives St.",      votes: 547, age: 4,  joined: "Mar 13",
    quote: "Has herded the same group of joggers for two years.",
    platform: ["A weekly dog parade down Wickenden", "Stricter rules around frisbees", "Universal puddle access"],
    palette: "smoke", ear: "perky", eye: "almond", snout: "blaze" },
  { id: "pepita",    name: "Pepita",                 breed: "Chihuahua",           owner: "R. Costa",          street: "Hope St.",      votes: 503, age: 9,  joined: "Mar 09",
    quote: "Eight pounds. Twelve enemies. Beloved.",
    platform: ["Smaller doors", "Earlier dinners", "A sweater subsidy"],
    palette: "honey", ear: "pointy", eye: "round", snout: "" },
  { id: "augusto",   name: "Augusto",                breed: "Portuguese Water Dog",owner: "The Pintos",        street: "Benefit St.",   votes: 461, age: 5,  joined: "Mar 15",
    quote: "Patriotic, aquatic. Will not stop fetching.",
    platform: ["Restore the Seekonk swim club", "Free towels at the dog park", "A statue near Fox Point Cabral Park"],
    palette: "blackt", ear: "floppy", eye: "almond", snout: "" },
  { id: "miso",      name: "Miso",                    breed: "Shiba Inu",           owner: "T. Wong",           street: "John St.",      votes: 422, age: 3,  joined: "Mar 17",
    quote: "Famously refuses to walk in the rain. Carried home twice this week.",
    platform: ["Covered sidewalks", "Less rain", "More miso"],
    palette: "cream", ear: "pointy", eye: "sleepy", snout: "blaze" },
  { id: "harriet",   name: "Harriet",                 breed: "Cocker Spaniel",      owner: "B. Ribeiro",        street: "Arnold St.",    votes: 388, age: 8,  joined: "Mar 12",
    quote: "Velvet-eared, conservative, has a regular table at the bakery.",
    platform: ["Quieter Sundays", "More biscuits, fewer crumbs", "Restore the old streetlights"],
    palette: "ginger", ear: "floppy", eye: "almond", snout: "" },
  { id: "kuma",      name: "Kuma",                    breed: "Akita",               owner: "The Saito-Brincks",  street: "Governor St.",  votes: 354, age: 6,  joined: "Mar 11",
    quote: "Eighty pounds of dignity. Walks itself.",
    platform: ["A bench dedicated in his name", "Ceremonial bowing on Wickenden", "Outlaw umbrellas"],
    palette: "white", ear: "pointy", eye: "almond", snout: "blaze" },
];

window.CONTESTANTS = RAW.map(r => {
  const p = palettes[r.palette];
  return {
    ...r,
    portrait: makePortrait({
      bg: p.bg, coat: p.coat, accent: p.accent,
      ear: r.ear || "round", eye: r.eye || "round", snout: r.snout || "",
      name: r.id, breed: r.breed
    })
  };
});

window.STREETS = FP_STREETS;
