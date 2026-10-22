/**
 * Đóng dấu chìm động (Dynamic Watermark) lên từng trang PDF bằng pdf-lib.
 * Font chuẩn của PDF không hỗ trợ tiếng Việt có dấu -> bỏ dấu trước khi vẽ.
 */
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { stripDiacritics } = require('../utils');

function ascii(s) {
  return stripDiacritics(s).replace(/[^\x20-\x7E]/g, '?');
}

/**
 * @param {Buffer} buffer PDF gốc
 * @param {string} text   chuỗi định danh người xem
 * @param {object} opts   { maxPages?: number, preview?: boolean }
 */
async function watermarkPdf(buffer, text, opts = {}) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  let pdf = src;
  const total = src.getPageCount();
  if (opts.maxPages && opts.maxPages < total) {
    pdf = await PDFDocument.create();
    const pages = await pdf.copyPages(src, Array.from({ length: opts.maxPages }, (_, i) => i));
    pages.forEach((p) => pdf.addPage(p));
  }
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const label = ascii(text);
  const footer = ascii(
    (opts.preview ? `BAN XEM TRUOC ${pdf.getPageCount()}/${total} trang - ` : '') +
      `UniShare | Cap phep cho: ${text} | ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | Nghiem cam phat tan`
  );
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(10, Math.min(width, height) / 30);
    for (let y = height * 0.15; y < height; y += height / 3.2) {
      for (let x = width * 0.05; x < width; x += width / 2) {
        page.drawText(label, { x, y, size, font, color: rgb(0.85, 0.1, 0.1), opacity: 0.13, rotate: degrees(30) });
      }
    }
    page.drawText(footer, { x: 12, y: 8, size: 7, font, color: rgb(0.4, 0.4, 0.4), opacity: 0.8 });
  }
  pdf.setProducer('UniShare Watermark');
  return Buffer.from(await pdf.save());
}

async function pageCount(buffer) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return src.getPageCount();
}

module.exports = { watermarkPdf, pageCount };
