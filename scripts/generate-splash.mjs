// Genera le schermate di avvio iOS (apple-touch-startup-image) in public/splash/.
// iPhone non costruisce lo splash dal manifest: senza queste immagini, all'apertura
// della PWA lo schermo resta bianco finché non arriva la pagina.
// Uso: node scripts/generate-splash.mjs   (poi rimuovere e ri-aggiungere l'app alla Home)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const devices = JSON.parse(fs.readFileSync(path.join(root, "src/lib/splash-screens.json"), "utf8"));
const leafSvg = fs.readFileSync(path.join(root, "public/maple-leaf.svg"));
// "Maple" in Geist SemiBold con il tracking dell'header, già convertito in tracciati
// (sharp ignora i font esterni e ripiegherebbe su Helvetica). Disegnato a corpo 100.
const wordmarkSvg = fs.readFileSync(path.join(root, "scripts/maple-wordmark.svg"));
const WORDMARK_SIZE = 100;

// stesso sfondo dell'app (--background): il passaggio alla pagina non dà lampi
const BACKGROUND = "#faf8f5";
// misure in punti iOS (moltiplicate per la densità del dispositivo)
const LEAF = 88;
const TEXT = 30;
const GAP = 14;

fs.mkdirSync(path.join(root, "public/splash"), { recursive: true });

for (const d of devices) {
  const width = d.w * d.dpr;
  const height = d.h * d.dpr;
  const leafPx = LEAF * d.dpr;
  const textScale = (TEXT * d.dpr) / WORDMARK_SIZE;

  const leaf = await sharp(leafSvg, { density: Math.ceil((72 * leafPx) / 100) }).resize(leafPx, leafPx).png().toBuffer();
  const text = await sharp(wordmarkSvg, { density: Math.ceil(72 * textScale) }).png().toBuffer();
  const textMeta = await sharp(text).metadata();

  // foglia + scritta centrate, il gruppo un filo sopra la metà (centro ottico)
  const group = leafPx + GAP * d.dpr + textMeta.height;
  const top = Math.round(height * 0.47 - group / 2);

  const file = path.join(root, "public/splash", `iphone-${width}x${height}.png`);
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite([
      { input: leaf, left: Math.round((width - leafPx) / 2), top },
      { input: text, left: Math.round((width - textMeta.width) / 2), top: top + leafPx + GAP * d.dpr },
    ])
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
  console.log(`${path.basename(file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  (${d.models})`);
}
