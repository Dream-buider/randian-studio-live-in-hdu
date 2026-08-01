import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  Ecc,
  QrCode,
} from 'tdesign-mobile-vue/es/_common/js/qrcode/qrcodegen.mjs';

const RUNTIME_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\public-trial';
const DEFAULT_OUTPUT = path.join(
  RUNTIME_ROOT,
  'artifacts',
  'public-trial-qr.png',
);
const errorCorrectionLevel: 'M' = 'M';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function chunk(type: string, data = Buffer.alloc(0)): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function pngFromQr(qr: QrCode, width: number, margin: number): Buffer {
  const modules = qr.size + margin * 2;
  const scale = Math.max(1, Math.floor(width / modules));
  const rendered = scale * modules;
  const offset = Math.floor((width - rendered) / 2);
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * width, 255);
  for (let y = 0; y < width; y += 1) {
    pixels[y * stride] = 0;
  }
  for (let moduleY = 0; moduleY < qr.size; moduleY += 1) {
    for (let moduleX = 0; moduleX < qr.size; moduleX += 1) {
      if (!qr.getModule(moduleX, moduleY)) {
        continue;
      }
      const left = offset + (moduleX + margin) * scale;
      const top = offset + (moduleY + margin) * scale;
      for (let y = top; y < top + scale; y += 1) {
        for (let x = left; x < left + scale; x += 1) {
          const pixel = y * stride + 1 + x * 3;
          pixels[pixel] = 0x11;
          pixels[pixel + 1] = 0x18;
          pixels[pixel + 2] = 0x27;
        }
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND'),
  ]);
}

const rawUrl = argument('--url');
if (!rawUrl) {
  throw new Error('--url is required');
}
const url = new URL(rawUrl);
if (url.protocol !== 'https:') {
  throw new Error('Public trial QR requires an HTTPS URL');
}
const output = path.resolve(argument('--output') ?? DEFAULT_OUTPUT);
const relative = path.relative(path.resolve(RUNTIME_ROOT), output);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  throw new Error('QR output must remain under the D-drive public-trial runtime');
}
const correction = errorCorrectionLevel === 'M' ? Ecc.MEDIUM : Ecc.MEDIUM;
const qr = QrCode.encodeText(url.href, correction);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, pngFromQr(qr, 720, 2));
process.stdout.write(`${output}\n`);
