// // routes/uploads.js
// 'use strict';

// const express = require('express');
// const multer = require('multer');
// const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// const path = require('path');
// const { randomUUID } = require('crypto'); // use built-in UUID generator
// const router = express.Router();

// // Optional: if you want auth on uploads, require your middleware here
// // const requireAuth = require('../middleware/requireAuth');

// const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
// const BUCKET = process.env.AWS_S3_BUCKET || null;
// const UPLOAD_PREFIX = process.env.UPLOADS_PREFIX || 'uploads';
// const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default

// // multer memory storage
// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: { fileSize: MAX_BYTES },
//   fileFilter: (req, file, cb) => {
//     // only images allowed
//     if (!file.mimetype || !file.mimetype.startsWith('image/')) {
//       return cb(new Error('Only image uploads are allowed'), false);
//     }
//     cb(null, true);
//   }
// });

// // instantiate S3 client only if bucket configured
// let s3 = null;
// if (BUCKET) {
//   try {
//     s3 = new S3Client({
//       region: REGION,
//       credentials: process.env.AWS_ACCESS_KEY_ID ? {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
//       } : undefined
//     });
//   } catch (e) {
//     console.warn('[uploads] Failed to init S3 client', e && e.message ? e.message : e);
//     s3 = null;
//   }
// } else {
//   console.warn('[uploads] AWS_S3_BUCKET not set — upload endpoint will return 500 until configured.');
// }

// // POST /uploads/photo
// // If you want to protect uploads, add requireAuth as second param: router.post('/photo', requireAuth, upload.single('file'), ...)
// router.post('/photo', upload.single('file'), async (req, res) => {
//   try {
//     if (!BUCKET || !s3) return res.status(500).json({ ok:false, error: 'Server upload not configured' });
//     if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, error: 'No file uploaded' });

//     const origName = req.file.originalname || 'photo';
//     const ext = path.extname(origName).toLowerCase() || '';
//     const id = randomUUID();
//     const ymd = new Date().toISOString().slice(0,10);
//     const key = `${UPLOAD_PREFIX}/${ymd}/${id}${ext}`;

//     const params = {
//       Bucket: BUCKET,
//       Key: key,
//       Body: req.file.buffer,
//       ContentType: req.file.mimetype,
//       // ACL: 'public-read' // only if you want/need object ACL and bucket permits it
//     };

//     await s3.send(new PutObjectCommand(params));

//     // Build public URL (simple S3 URL — adapt if you use CloudFront or private buckets)
//     const url = REGION === 'us-east-1'
//       ? `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`
//       : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;

//     return res.json({ ok: true, url });
//   } catch (err) {
//     console.error('upload error', err && (err.stack || err));
//     // multer errors sometimes appear as err.code === 'LIMIT_FILE_SIZE'
//     if (err && err.code === 'LIMIT_FILE_SIZE') {
//       return res.status(400).json({ ok:false, error: 'File too large' });
//     }
//     return res.status(500).json({ ok:false, error: 'Upload failed' });
//   }
// });

// module.exports = router;

// routes/uploads.js
'use strict';

const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// env / config
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || null;
const UPLOAD_PREFIX = (process.env.UPLOADS_PREFIX || 'uploads').replace(/\/+$/,'');
const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // ensure same as server.js static mount
const FORCE_ABSOLUTE_URL = (process.env.UPLOADS_RETURN_ABSOLUTE || '1') === '1';

// ensure uploads dir exists for local fallback
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('[uploads] failed to create uploads dir', err && err.message);
}

// multer memory storage (we will write buffer to disk or upload to S3)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    // Accept images & common media for thumbnails. Adjust if you want more types.
    const allowed = ['image/', 'video/', 'application/pdf'];
    if (!file.mimetype || !allowed.some(pref => file.mimetype.startsWith(pref))) {
      return cb(new Error('Only images, videos or pdf uploads are allowed'), false);
    }
    cb(null, true);
  }
});

// init S3 client if configured
let s3 = null;
if (BUCKET) {
  try {
    s3 = new S3Client({
      region: REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      } : undefined
    });
  } catch (e) {
    console.warn('[uploads] Failed to init S3 client', e && e.message ? e.message : e);
    s3 = null;
  }
} else {
  // not an error — fallback to local disk
  s3 = null;
}

/**
 * helper: build absolute URL for local files (uses request host),
 * but can still return relative '/uploads/...' if FORCE_ABSOLUTE_URL === false.
 */
function buildLocalUrl(req, filename) {
  const rel = `/${UPLOAD_PREFIX}/${encodeURIComponent(filename)}`;
  if (!FORCE_ABSOLUTE_URL) return rel;
  const protocol = req.protocol || 'https';
  const host = req.get && req.get('host') ? req.get('host') : (process.env.FRONTEND_HOST || 'localhost:' + (process.env.PORT || 5000));
  return `${protocol}://${host}${rel}`;
}

/**
 * helper: upload buffer to S3 and return public URL (best-effort)
 */
async function uploadToS3(buffer, key, contentType) {
  if (!s3) throw new Error('S3 not configured');
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // set CacheControl if you want: 'public, max-age=31536000'
  };
  await s3.send(new PutObjectCommand(params));
  // Build public S3 URL (this is simple; if you use CloudFront or private bucket you may need presigned).
  const url = REGION === 'us-east-1'
    ? `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`
    : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;
  return url;
}

/**
 * internal unified upload handler used by endpoints
 * - req.file (buffer) must exist
 * - returns { ok:true, url, key }
 */
async function handleFileUpload(req, fileBuffer, originalName, mimetype) {
  // sanitize ext
  const ext = path.extname(originalName) || (mimetype ? ('.' + String(mimetype).split('/')[1]) : '');
  const id = uuidv4();
  const ymd = new Date().toISOString().slice(0,10);
  const filename = `${id}${ext}`;
  const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;

  // prefer S3 if configured
  if (s3 && BUCKET) {
    const url = await uploadToS3(fileBuffer, key, mimetype || 'application/octet-stream');
    return { ok: true, url, key };
  }

  // else, write to local UPLOADS_DIR (mirror the key structure)
  const localDir = path.join(UPLOADS_DIR, ymd);
  try {
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const filePath = path.join(localDir, filename);
    fs.writeFileSync(filePath, fileBuffer);
  } catch (err) {
    throw new Error('Failed to write upload to disk: ' + (err && err.message));
  }

  // return URL relative to server static mount; prefer absolute so other devices can access
  return { ok: true, url: buildLocalUrl(req, `${ymd}/${filename}`), key: `${ymd}/${filename}` };
}

// POST /api/uploads/photo  (kept for backwards compatibility)
router.post('/photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'No file uploaded (use field name "file")' });

    const { buffer, originalname, mimetype } = req.file;
    const out = await handleFileUpload(req, buffer, originalname || 'photo', mimetype);
    return res.json({ ok: true, url: out.url, key: out.key });
  } catch (err) {
    console.error('[uploads/photo] error', err && (err.stack || err));
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
    return res.status(500).json({ ok:false, error: err && err.message ? err.message : 'Upload failed' });
  }
});

// POST /api/uploads  - also accepts multipart field "file" OR JSON { dataUrl, filename }
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // multipart
    if (req.file && req.file.buffer) {
      const { buffer, originalname, mimetype } = req.file;
      const out = await handleFileUpload(req, buffer, originalname || 'file', mimetype);
      return res.json({ ok: true, url: out.url, key: out.key });
    }

    // fallback: JSON base64 dataUrl + filename
    const body = req.body || {};
    if (body.dataUrl && body.filename) {
      const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });

      const mime = matches[1];
      const b64 = matches[2];
      const buffer = Buffer.from(b64, 'base64');
      const filename = body.filename || ('upload_' + randomUUID());
      const out = await handleFileUpload(req, buffer, filename, mime);
      return res.json({ ok: true, url: out.url, key: out.key });
    }

    return res.status(400).json({ ok:false, error:'No file provided' });
  } catch (err) {
    console.error('[uploads] error', err && (err.stack || err));
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
    return res.status(500).json({ ok:false, error: err && err.message ? err.message : 'Upload failed' });
  }
});

module.exports = router;
