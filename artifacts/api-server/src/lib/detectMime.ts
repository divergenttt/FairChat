import fs from "fs";

export async function detectMimeFromFile(filePath: string): Promise<string | null> {
  const fh = await fs.promises.open(filePath, "r");
  try {
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    return detectMimeFromBuffer(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

export function detectMimeFromBuffer(b: Buffer): string | null {
  if (b.length < 4) return null;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";

  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";

  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length >= 12) {
    const fmt = b.slice(8, 12).toString("ascii");
    if (fmt === "WEBP") return "image/webp";
    if (fmt === "WAVE") return "audio/wav";
  }

  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = b.slice(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "heim" || brand === "heis" ||
        brand === "hevc" || brand === "hevx" || brand === "hevm" || brand === "hevs" ||
        brand === "mif1" || brand === "msf1") return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    if (brand === "M4A " || brand === "M4B ") return "audio/mp4";
    if (brand === "isom" || brand === "iso2" || brand === "mp41" || brand === "mp42" ||
        brand === "M4V " || brand === "avc1" || brand === "dash") return "video/mp4";
  }

  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const head = b.slice(0, Math.min(b.length, 64)).toString("binary");
    if (head.includes("webm")) return "video/webm";
    return "video/webm";
  }

  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";

  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return "audio/flac";

  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
      (b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2))) return "audio/mpeg";

  if (b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9)) return "audio/aac";

  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";

  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    return "application/zip";
  }

  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
      b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) {
    return "application/msword";
  }

  return null;
}
