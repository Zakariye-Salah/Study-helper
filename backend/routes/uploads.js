// routes/uploads.js
'use strict';

const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const { randomUUID } = require('crypto'); // use built-in UUID generator
const router = express.Router();

// Optional: if you want auth on uploads, require your middleware here
// const requireAuth = require('../middleware/requireAuth');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || null;
const UPLOAD_PREFIX = process.env.UPLOADS_PREFIX || 'uploads';
const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default

// multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    // only images allowed
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'), false);
    }
    cb(null, true);
  }
});

// instantiate S3 client only if bucket configured
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
  console.warn('[uploads] AWS_S3_BUCKET not set — upload endpoint will return 500 until configured.');
}

// POST /uploads/photo
// If you want to protect uploads, add requireAuth as second param: router.post('/photo', requireAuth, upload.single('file'), ...)
router.post('/photo', upload.single('file'), async (req, res) => {
  try {
    if (!BUCKET || !s3) return res.status(500).json({ ok:false, error: 'Server upload not configured' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, error: 'No file uploaded' });

    const origName = req.file.originalname || 'photo';
    const ext = path.extname(origName).toLowerCase() || '';
    const id = randomUUID();
    const ymd = new Date().toISOString().slice(0,10);
    const key = `${UPLOAD_PREFIX}/${ymd}/${id}${ext}`;

    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      // ACL: 'public-read' // only if you want/need object ACL and bucket permits it
    };

    await s3.send(new PutObjectCommand(params));

    // Build public URL (simple S3 URL — adapt if you use CloudFront or private buckets)
    const url = REGION === 'us-east-1'
      ? `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`
      : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;

    return res.json({ ok: true, url });
  } catch (err) {
    console.error('upload error', err && (err.stack || err));
    // multer errors sometimes appear as err.code === 'LIMIT_FILE_SIZE'
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok:false, error: 'File too large' });
    }
    return res.status(500).json({ ok:false, error: 'Upload failed' });
  }
});

module.exports = router;
