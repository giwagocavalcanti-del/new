// Builds the photos the shop serves, from the originals in public/products/.
//
//   node scripts/images/build-photos.mjs
//
// Run it again whenever a photo in public/products/ is added or replaced.
//
// Why not leave it to next/image: its AVIF encoder turns quality 90 into 56 and
// halves the colour resolution (4:2:0), which smears the thin dark gaps between
// the slats into the wood and washes out the grain. Here every width is encoded
// once, with full colour resolution (4:4:4) and a higher quality, and the files
// get a content hash in their name so they can be cached for a year.
//
// It also makes a small square JPEG of each photo for the order emails (email
// programs such as Outlook show neither AVIF nor WebP), and cuts the finish swatches out of the real photos, so the small colour
// chips show the actual wood and felt instead of a flat colour, and prints the
// measured slat and felt colours for src/data/catalogue.ts.
//
// sharp comes with Next.js; nothing extra to install.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIR = path.join(ROOT, "public/products");
const OUT_DIR = path.join(SOURCE_DIR, "web");
const SWATCH_DIR = path.join(ROOT, "public/swatches");
const EMAIL_DIR = path.join(SOURCE_DIR, "email");
const MANIFEST = path.join(ROOT, "src/data/photo-variants.ts");

/** Widths produced for every photo (never wider than the original). */
const WIDTHS = [256, 480, 768, 1080, 1440];
const AVIF = { quality: 76, effort: 7, chromaSubsampling: "4:4:4" };
const WEBP = { quality: 90, effort: 6, smartSubsample: true };

/**
 * Where each finish swatch is cut from: a 320 × 320 px square of evenly lit wall
 * in that finish's Premium photo, picked by hand so no furniture or lamp is in it.
 */
const SWATCHES = {
  "natural-oak": ["lamellen-wandpaneel-eiche-natur.jpg", 680, 190],
  "washed-oak": ["lamellen-wandpaneel-eiche-gekalkt.jpg", 362, 302],
  "honey-oak": ["lamellen-wandpaneel-eiche-honig.jpg", 130, 520],
  walnut: ["lamellen-wandpaneel-nussbaum.jpg", 121, 121],
  "smoked-oak": ["lamellen-wandpaneel-raeuchereiche.jpg", 242, 242],
  "black-oak": ["lamellen-wandpaneel-eiche-schwarz.jpg", 700, 180],
};
const SWATCH_CROP = 320;

/**
 * The "Nahaufnahme" view: a 4:5 piece of the same Premium photo, so the close-up shows
 * exactly the colour and finish of the room photo. [file, left, top, width] in the original;
 * the height is width × 1.25. Picked by hand to keep furniture, lamps and ceiling out.
 */
const CLOSEUPS = {
  "natural-oak": ["lamellen-wandpaneel-eiche-natur.jpg", 560, 120, 540],
  "washed-oak": ["lamellen-wandpaneel-eiche-gekalkt.jpg", 345, 225, 512],
  "honey-oak": ["lamellen-wandpaneel-eiche-honig.jpg", 50, 330, 480],
  walnut: ["lamellen-wandpaneel-nussbaum.jpg", 40, 100, 480],
  "smoked-oak": ["lamellen-wandpaneel-raeuchereiche.jpg", 100, 150, 540],
  "black-oak": ["lamellen-wandpaneel-eiche-schwarz.jpg", 755, 100, 448],
};
const CLOSEUP_SIZE = [1080, 1350];
const SWATCH_SIZE = 192;
/** Shown at 80 × 80 px in the emails; twice that for sharp phone screens. */
const EMAIL_SIZE = 160;

const hash = (...parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 8);
const hex = (rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

/** Encodes every width of one image into OUT_DIR and returns its manifest entry. */
async function buildVariants(stem, input) {
  const { width, height } = await sharp(input).metadata();
  const widths = [...new Set([...WIDTHS.filter((w) => w < width), width])];
  const id = hash(input.toString("base64"), JSON.stringify([AVIF, WEBP]));
  const variants = [];

  for (const w of widths) {
    const resized = sharp(input).rotate().resize(w, undefined, { kernel: "lanczos3" });
    // A light sharpen only where the photo was scaled down, to keep the slat edges crisp.
    if (w < width) resized.sharpen({ sigma: 0.5, m1: 0.5, m2: 1.5 });
    const pixels = await resized.toColourspace("srgb").toBuffer();
    for (const [ext, encode] of [
      ["avif", (img) => img.avif(AVIF)],
      ["webp", (img) => img.webp(WEBP)],
    ]) {
      const name = `${stem}-${w}.${id}.${ext}`;
      await writeFile(path.join(OUT_DIR, name), await encode(sharp(pixels)).toBuffer());
    }
    variants.push(w);
  }

  console.log(`${stem}: ${variants.join(", ")} px`);
  return { base: `/products/web/${stem}`, id, width, height, widths: variants };
}

async function buildPhotos() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SOURCE_DIR)).filter((name) => /\.(jpe?g|png)$/i.test(name)).sort();
  const photos = {};
  for (const file of files) {
    const input = await readFile(path.join(SOURCE_DIR, file));
    photos[`/products/${file}`] = await buildVariants(file.replace(/\.[^.]+$/, ""), input);
  }
  return photos;
}

/**
 * Square JPEGs for the emails, centred on the photo. Fixed names without a hash and the
 * folder is never emptied: an email already sent keeps pointing at its picture.
 */
async function buildEmailThumbnails() {
  await mkdir(EMAIL_DIR, { recursive: true });
  const files = (await readdir(SOURCE_DIR)).filter((name) => /\.(jpe?g|png)$/i.test(name)).sort();
  const thumbnails = {};
  for (const file of files) {
    const name = `${file.replace(/\.[^.]+$/, "")}.jpg`;
    const output = await sharp(path.join(SOURCE_DIR, file))
      .rotate()
      .resize(EMAIL_SIZE, EMAIL_SIZE, { fit: "cover", kernel: "lanczos3" })
      .sharpen({ sigma: 0.5 })
      .toColourspace("srgb")
      .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    await writeFile(path.join(EMAIL_DIR, name), output);
    thumbnails[`/products/${file}`] = `/products/email/${name}`;
  }
  console.log(`email thumbnails: ${files.length}`);
  return thumbnails;
}

/** Close-ups: cut from the photo, enlarged with a sharp filter, then encoded like the photos. */
async function buildCloseups(photos) {
  const closeups = {};
  for (const [finish, [file, left, top, width]] of Object.entries(CLOSEUPS)) {
    const input = await sharp(path.join(SOURCE_DIR, file))
      .extract({ left, top, width, height: Math.round(width * 1.25) })
      .resize(...CLOSEUP_SIZE, { kernel: "lanczos3" })
      .sharpen({ sigma: 0.8, m1: 0.6, m2: 2 })
      .png()
      .toBuffer();
    const key = `/products/nahaufnahme/${finish}`;
    photos[key] = await buildVariants(`nahaufnahme-${finish}`, input);
    closeups[finish] = key;
  }
  return closeups;
}

/** Median colour of the brightest half of the pixels (wood) and the darkest tenth (felt in the gaps). */
function measure(raw) {
  const pixels = [];
  for (let i = 0; i < raw.length; i += 3) {
    const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
    pixels.push({ rgb: [r, g, b], luma: 0.2126 * r + 0.7152 * g + 0.0722 * b });
  }
  pixels.sort((a, b) => a.luma - b.luma);
  const median = (slice) => [0, 1, 2].map((c) => slice.map((p) => p.rgb[c]).sort((a, b) => a - b)[slice.length >> 1]);
  return {
    slat: hex(median(pixels.slice(Math.floor(pixels.length * 0.5)))),
    felt: hex(median(pixels.slice(0, Math.floor(pixels.length * 0.1)))),
  };
}

async function buildSwatches() {
  await rm(SWATCH_DIR, { recursive: true, force: true });
  await mkdir(SWATCH_DIR, { recursive: true });
  const swatches = {};

  for (const [finish, [file, left, top]] of Object.entries(SWATCHES)) {
    const crop = sharp(path.join(SOURCE_DIR, file)).extract({ left, top, width: SWATCH_CROP, height: SWATCH_CROP });
    const raw = await crop.clone().removeAlpha().raw().toBuffer();
    const output = await crop.resize(SWATCH_SIZE, SWATCH_SIZE, { kernel: "lanczos3" }).sharpen({ sigma: 0.5 }).webp(WEBP).toBuffer();
    const name = `${finish}.${hash(output.toString("base64"))}.webp`;
    await writeFile(path.join(SWATCH_DIR, name), output);
    swatches[finish] = `/swatches/${name}`;
    const { slat, felt } = measure(raw);
    console.log(`swatch ${finish}: slat ${slat}, felt ${felt}`);
  }
  return swatches;
}

const photos = await buildPhotos();
const closeups = await buildCloseups(photos);
const swatches = await buildSwatches();
const emailThumbnails = await buildEmailThumbnails();

await writeFile(
  MANIFEST,
  `// Generated by scripts/images/build-photos.mjs. Do not edit by hand; run the script again.

export type PhotoVariants = { base: string; id: string; width: number; height: number; widths: number[] };

/** Pre-built AVIF and WebP widths of each photo in public/products/. */
export const photoVariants: Record<string, PhotoVariants> = ${JSON.stringify(photos, null, 2)};

/** Close-up ("Nahaufnahme") of each finish, cut from its Premium photo: a key of photoVariants. */
export const closeupPhotos: Record<string, string> = ${JSON.stringify(closeups, null, 2)};

/** Finish swatches cut from the real photos, keyed by finish id. */
export const swatchImages: Record<string, string> = ${JSON.stringify(swatches, null, 2)};

/** Small square JPEG of each photo for the order emails, keyed like photoVariants. */
export const emailThumbnails: Record<string, string> = ${JSON.stringify(emailThumbnails, null, 2)};
`,
);
console.log(`\nWrote ${path.relative(ROOT, MANIFEST)}`);
