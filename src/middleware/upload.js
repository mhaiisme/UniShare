const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { DATA_DIR } = require('../db');

const DOC_DIR = path.join(DATA_DIR, 'docs');
const IMG_DIR = path.join(DATA_DIR, 'listing-images');
fs.mkdirSync(DOC_DIR, { recursive: true });
fs.mkdirSync(IMG_DIR, { recursive: true });

function storage(dir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + path.extname(file.originalname).toLowerCase()),
  });
}

function fixName(file) {
  // multer giải mã tên file theo latin1 -> chuyển về UTF-8 cho tên tiếng Việt
  try {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
  } catch (_) { /* giữ nguyên */ }
}

const docUpload = multer({
  storage: storage(DOC_DIR),
  limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    fixName(file);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.ALLOWED_DOC_EXT.includes(ext)) return cb(new Error(`Định dạng ${ext || '(không rõ)'} không được hỗ trợ.`));
    cb(null, true);
  },
});

const imageUpload = multer({
  storage: storage(IMG_DIR),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    fixName(file);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return cb(new Error('Ảnh phải là PNG/JPG/WEBP/GIF.'));
    cb(null, true);
  },
});

/** Bọc middleware multer để lỗi upload hiển thị thân thiện thay vì trang 500. */
function handle(mw) {
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (err) {
        req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá dung lượng cho phép.' : err.message;
      }
      next();
    });
}

module.exports = {
  DOC_DIR,
  IMG_DIR,
  docFile: handle(docUpload.single('file')),
  listingImage: handle(imageUpload.single('image')),
};
