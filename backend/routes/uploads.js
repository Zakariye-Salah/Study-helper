// // // // routes/uploads.js
// // // 'use strict';

// // // const express = require('express');
// // // const multer = require('multer');
// // // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// // // const path = require('path');
// // // const { randomUUID } = require('crypto'); // use built-in UUID generator
// // // const router = express.Router();
// // // const fs = require('fs');
// // // const { v4: uuidv4 } = require('uuid');


// // // // Optional: if you want auth on uploads, require your middleware here
// // // // const requireAuth = require('../middleware/requireAuth');

// // // const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
// // // const BUCKET = process.env.AWS_S3_BUCKET || null;
// // // const UPLOAD_PREFIX = process.env.UPLOADS_PREFIX || 'uploads';
// // // const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default

// // // // multer memory storage
// // // const storage = multer.memoryStorage();
// // // const upload = multer({
// // //   storage,
// // //   limits: { fileSize: MAX_BYTES },
// // //   fileFilter: (req, file, cb) => {
// // //     // only images allowed
// // //     if (!file.mimetype || !file.mimetype.startsWith('image/')) {
// // //       return cb(new Error('Only image uploads are allowed'), false);
// // //     }
// // //     cb(null, true);
// // //   }
// // // });

// // // // instantiate S3 client only if bucket configured
// // // let s3 = null;
// // // if (BUCKET) {
// // //   try {
// // //     s3 = new S3Client({
// // //       region: REGION,
// // //       credentials: process.env.AWS_ACCESS_KEY_ID ? {
// // //         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
// // //         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// // //       } : undefined
// // //     });
// // //   } catch (e) {
// // //     console.warn('[uploads] Failed to init S3 client', e && e.message ? e.message : e);
// // //     s3 = null;
// // //   }
// // // } else {
// // //   console.warn('[uploads] AWS_S3_BUCKET not set — upload endpoint will return 500 until configured.');
// // // }

// // // // POST /uploads/photo
// // // // If you want to protect uploads, add requireAuth as second param: router.post('/photo', requireAuth, upload.single('file'), ...)
// // // router.post('/photo', upload.single('file'), async (req, res) => {
// // //   try {
// // //     if (!BUCKET || !s3) return res.status(500).json({ ok:false, error: 'Server upload not configured' });
// // //     if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, error: 'No file uploaded' });

// // //     const origName = req.file.originalname || 'photo';
// // //     const ext = path.extname(origName).toLowerCase() || '';
// // //     const id = randomUUID();
// // //     const ymd = new Date().toISOString().slice(0,10);
// // //     const key = `${UPLOAD_PREFIX}/${ymd}/${id}${ext}`;

// // //     const params = {
// // //       Bucket: BUCKET,
// // //       Key: key,
// // //       Body: req.file.buffer,
// // //       ContentType: req.file.mimetype,
// // //       // ACL: 'public-read' // only if you want/need object ACL and bucket permits it
// // //     };

// // //     await s3.send(new PutObjectCommand(params));

// // //     // Build public URL (simple S3 URL — adapt if you use CloudFront or private buckets)
// // //     const url = REGION === 'us-east-1'
// // //       ? `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`
// // //       : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;

// // //     return res.json({ ok: true, url });
// // //   } catch (err) {
// // //     console.error('upload error', err && (err.stack || err));
// // //     // multer errors sometimes appear as err.code === 'LIMIT_FILE_SIZE'
// // //     if (err && err.code === 'LIMIT_FILE_SIZE') {
// // //       return res.status(400).json({ ok:false, error: 'File too large' });
// // //     }
// // //     return res.status(500).json({ ok:false, error: 'Upload failed' });
// // //   }
// // // });


// // // /**
// // //  * POST /api/uploads
// // //  * Accepts multipart/form-data (file field "file") OR JSON with { filename, dataUrl }
// // //  * Returns { ok:true, url: '/uploads/xxx.png' }
// // //  * please use for uploading thumnails files and teacher photo files
// // //  */
// // // router.post('/', upload.single('file'), async (req, res) => {
// // //   try {
// // //     // multipart upload
// // //     if (req.file) {
// // //       const urlPath = '/uploads/' + req.file.filename;
// // //       return res.json({ ok: true, url: urlPath });
// // //     }

// // //     // fallback: base64 data in JSON body
// // //     const body = req.body || {};
// // //     if (body.dataUrl && body.filename) {
// // //       // dataUrl format: data:[mime];base64,BASE64...
// // //       const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
// // //       if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });
// // //       const mime = matches[1];
// // //       const b64 = matches[2];
// // //       const ext = path.extname(body.filename) || (mime.split('/') && '.' + mime.split('/')[1]) || '.bin';
// // //       const filename = uuidv4() + ext;
// // //       const filePath = path.join(UPLOADS_DIR, filename);
// // //       const buffer = Buffer.from(b64, 'base64');
// // //       fs.writeFileSync(filePath, buffer);
// // //       const urlPath = '/uploads/' + filename;
// // //       return res.json({ ok: true, url: urlPath });
// // //     }

// // //     return res.status(400).json({ ok:false, error:'No file provided' });
// // //   } catch (err) {
// // //     console.error('POST /uploads error', err);
// // //     return res.status(500).json({ ok:false, error:'Server error' });
// // //   }
// // // });


// // // module.exports = router;


// // // const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // same as server.js uploads dir




// // routes/uploads.js
// 'use strict';

// const express = require('express');
// const multer = require('multer');
// const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// const path = require('path');
// const fs = require('fs');
// const { randomUUID } = require('crypto');
// const { v4: uuidv4 } = require('uuid');

// const router = express.Router();

// // Config
// const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
// const BUCKET = process.env.AWS_S3_BUCKET || '';
// const UPLOAD_PREFIX = (process.env.UPLOADS_PREFIX || 'uploads').replace(/\/+$/,'');
// const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default
// const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');

// // ensure local uploads dir exists (if using local)
// try { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { console.warn('[uploads] mkdir failed', e && e.message); }

// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: { fileSize: MAX_BYTES },
//   fileFilter: (req, file, cb) => {
//     // accept images and common media types (adjust if you need video/audio)
//     if (!file.mimetype) return cb(new Error('No mimetype'), false);
//     // allow images, video, audio for lessons if you want
//     if (!/^(image|video|audio)\//.test(file.mimetype)) {
//       return cb(new Error('Only image/video/audio uploads are allowed'), false);
//     }
//     cb(null, true);
//   }
// });

// // init S3 client if configured
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
//     console.warn('[uploads] S3 init failed', e && e.message);
//     s3 = null;
//   }
// }

// // helper to build S3 URL
// function s3UrlFor(key) {
//   if (!key) return key;
//   if (REGION === 'us-east-1') return `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`;
//   return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;
// }

// // POST /api/uploads/photo  (keeps compatibility with your earlier code)
// router.post('/photo', upload.single('file'), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

//     const origName = req.file.originalname || 'photo';
//     const ext = path.extname(origName) || '';
//     const id = randomUUID();
//     const ymd = new Date().toISOString().slice(0,10);
//     const filename = `${id}${ext}`;

//     if (s3) {
//       const key = `${UPLOAD_PREFIX}/photos/${ymd}/${filename}`;
//       const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
//       await s3.send(new PutObjectCommand(params));
//       return res.json({ ok: true, url: s3UrlFor(key) });
//     } else {
//       const outDir = path.join(UPLOADS_DIR, 'photos', ymd);
//       if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
//       const filePath = path.join(outDir, filename);
//       fs.writeFileSync(filePath, req.file.buffer);
//       // return path under /uploads so static middleware serves it
//       const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
//       return res.json({ ok: true, url: `/${rel}` });
//     }
//   } catch (err) {
//     console.error('[uploads/photo] error', err && (err.stack || err));
//     if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
//     return res.status(500).json({ ok:false, error: 'Upload failed' });
//   }
// });

// /**
//  * POST /api/uploads
//  * Accepts:
//  *  - multipart/form-data (file field "file")
//  *  - or JSON { filename, dataUrl } where dataUrl is data:<mime>;base64,...
//  * Returns: { ok:true, url }
//  */
// router.post('/', upload.single('file'), async (req, res) => {
//   try {
//     // 1) multipart file upload
//     if (req.file) {
//       const origName = req.file.originalname || `upload-${Date.now()}`;
//       const ext = path.extname(origName) || '';
//       const filename = uuidv4() + ext;
//       const ymd = new Date().toISOString().slice(0,10);

//       if (s3) {
//         const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
//         const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
//         await s3.send(new PutObjectCommand(params));
//         return res.json({ ok: true, url: s3UrlFor(key) });
//       } else {
//         const outDir = path.join(UPLOADS_DIR, ymd);
//         if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
//         const filePath = path.join(outDir, filename);
//         fs.writeFileSync(filePath, req.file.buffer);
//         const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
//         return res.json({ ok: true, url: `/${rel}` });
//       }
//     }

//     // 2) JSON body dataUrl
//     const body = req.body || {};
//     if (body.dataUrl && body.filename) {
//       const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
//       if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });
//       const mime = matches[1];
//       const b64 = matches[2];
//       const ext = path.extname(body.filename) || (mime.split('/') && '.' + mime.split('/')[1]) || '.bin';
//       const filename = uuidv4() + ext;
//       const ymd = new Date().toISOString().slice(0,10);
//       const buffer = Buffer.from(b64, 'base64');

//       if (s3) {
//         const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
//         const params = { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mime };
//         await s3.send(new PutObjectCommand(params));
//         return res.json({ ok:true, url: s3UrlFor(key) });
//       } else {
//         const outDir = path.join(UPLOADS_DIR, ymd);
//         if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
//         const filePath = path.join(outDir, filename);
//         fs.writeFileSync(filePath, buffer);
//         const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
//         return res.json({ ok: true, url: `/${rel}` });
//       }
//     }

//     return res.status(400).json({ ok:false, error:'No file provided' });
//   } catch (err) {
//     console.error('[uploads] POST error', err && (err.stack || err));
//     if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// module.exports = router;
// // // backend/routes/uploads.js
// // 'use strict';

// // const express = require('express');
// // const multer = require('multer');
// // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// // const path = require('path');
// // const fs = require('fs');
// // const { randomUUID } = require('crypto');

// // const router = express.Router();

// // // Config
// // const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
// // const BUCKET = process.env.AWS_S3_BUCKET || '';
// // const UPLOAD_PREFIX = (process.env.UPLOADS_PREFIX || 'uploads').replace(/\/+$/,'');
// // const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default
// // const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');

// // // ensure local uploads dir exists (if using local)
// // try {
// //   if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
// // } catch (e) {
// //   console.warn('[uploads] mkdir failed', e && e.message);
// // }

// // // multer memory storage
// // const storage = multer.memoryStorage();
// // const upload = multer({
// //   storage,
// //   limits: { fileSize: MAX_BYTES },
// //   fileFilter: (req, file, cb) => {
// //     if (!file.mimetype) return cb(new Error('No mimetype'), false);
// //     // allow images, video, audio
// //     if (!/^(image|video|audio)\//.test(file.mimetype)) {
// //       return cb(new Error('Only image/video/audio uploads are allowed'), false);
// //     }
// //     cb(null, true);
// //   }
// // });

// // // init S3 client if configured
// // let s3 = null;
// // if (BUCKET) {
// //   try {
// //     s3 = new S3Client({
// //       region: REGION,
// //       credentials: process.env.AWS_ACCESS_KEY_ID ? {
// //         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
// //         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// //       } : undefined
// //     });
// //   } catch (e) {
// //     console.warn('[uploads] S3 init failed', e && e.message);
// //     s3 = null;
// //   }
// // }

// // // helper to build S3 URL
// // function s3UrlFor(key) {
// //   if (!key) return key;
// //   if (REGION === 'us-east-1') return `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`;
// //   return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;
// // }

// // // POST /api/uploads/photo  (keeps compatibility with earlier code)
// // // Accepts multipart file under field "file"
// // router.post('/photo', upload.single('file'), async (req, res) => {
// //   try {
// //     if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

// //     const origName = req.file.originalname || 'photo';
// //     const ext = path.extname(origName) || '';
// //     const id = randomUUID();
// //     const ymd = new Date().toISOString().slice(0,10);
// //     const filename = `${id}${ext}`;

// //     if (s3) {
// //       const key = `${UPLOAD_PREFIX}/photos/${ymd}/${filename}`;
// //       const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
// //       await s3.send(new PutObjectCommand(params));
// //       return res.json({ ok: true, url: s3UrlFor(key) });
// //     } else {
// //       const outDir = path.join(UPLOADS_DIR, 'photos', ymd);
// //       if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
// //       const filePath = path.join(outDir, filename);
// //       fs.writeFileSync(filePath, req.file.buffer);
// //       // return path under /uploads so static middleware serves it
// //       const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
// //       return res.json({ ok: true, url: `/${rel}` });
// //     }
// //   } catch (err) {
// //     console.error('[uploads/photo] error', err && (err.stack || err));
// //     if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
// //     return res.status(500).json({ ok:false, error: 'Upload failed' });
// //   }
// // });

// // /**
// //  * POST /api/uploads
// //  * Accepts:
// //  *  - multipart/form-data (file field "file")
// //  *  - or JSON { filename, dataUrl } where dataUrl is data:<mime>;base64,...
// //  * Returns: { ok:true, url }
// //  */
// // router.post('/', upload.single('file'), async (req, res) => {
// //   try {
// //     // 1) multipart file upload
// //     if (req.file) {
// //       const origName = req.file.originalname || `upload-${Date.now()}`;
// //       const ext = path.extname(origName) || '';
// //       const filename = randomUUID() + ext;
// //       const ymd = new Date().toISOString().slice(0,10);

// //       if (s3) {
// //         const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
// //         const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
// //         await s3.send(new PutObjectCommand(params));
// //         return res.json({ ok: true, url: s3UrlFor(key) });
// //       } else {
// //         const outDir = path.join(UPLOADS_DIR, ymd);
// //         if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
// //         const filePath = path.join(outDir, filename);
// //         fs.writeFileSync(filePath, req.file.buffer);
// //         const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
// //         return res.json({ ok: true, url: `/${rel}` });
// //       }
// //     }

// //     // 2) JSON body dataUrl
// //     const body = req.body || {};
// //     if (body.dataUrl && body.filename) {
// //       const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
// //       if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });
// //       const mime = matches[1];
// //       const b64 = matches[2];
// //       const ext = path.extname(body.filename) || (mime.split('/') && '.' + mime.split('/')[1]) || '.bin';
// //       const filename = randomUUID() + ext;
// //       const ymd = new Date().toISOString().slice(0,10);
// //       const buffer = Buffer.from(b64, 'base64');

// //       if (s3) {
// //         const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
// //         const params = { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mime };
// //         await s3.send(new PutObjectCommand(params));
// //         return res.json({ ok:true, url: s3UrlFor(key) });
// //       } else {
// //         const outDir = path.join(UPLOADS_DIR, ymd);
// //         if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
// //         const filePath = path.join(outDir, filename);
// //         fs.writeFileSync(filePath, buffer);
// //         const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
// //         return res.json({ ok: true, url: `/${rel}` });
// //       }
// //     }

// //     return res.status(400).json({ ok:false, error:'No file provided' });
// //   } catch (err) {
// //     console.error('[uploads] POST error', err && (err.stack || err));
// //     if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
// //     return res.status(500).json({ ok:false, error:'Server error' });
// //   }
// // });

// // module.exports = router;

// // // routes/uploads.js
// // 'use strict';

// // const express = require('express');
// // const multer = require('multer');
// // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// // const path = require('path');
// // const { randomUUID } = require('crypto'); // use built-in UUID generator
// // const router = express.Router();
// // const fs = require('fs');
// // const { v4: uuidv4 } = require('uuid');


// // // Optional: if you want auth on uploads, require your middleware here
// // // const requireAuth = require('../middleware/requireAuth');

// // const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
// // const BUCKET = process.env.AWS_S3_BUCKET || null;
// // const UPLOAD_PREFIX = process.env.UPLOADS_PREFIX || 'uploads';
// // const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default

// // // multer memory storage
// // const storage = multer.memoryStorage();
// // const upload = multer({
// //   storage,
// //   limits: { fileSize: MAX_BYTES },
// //   fileFilter: (req, file, cb) => {
// //     // only images allowed
// //     if (!file.mimetype || !file.mimetype.startsWith('image/')) {
// //       return cb(new Error('Only image uploads are allowed'), false);
// //     }
// //     cb(null, true);
// //   }
// // });

// // // instantiate S3 client only if bucket configured
// // let s3 = null;
// // if (BUCKET) {
// //   try {
// //     s3 = new S3Client({
// //       region: REGION,
// //       credentials: process.env.AWS_ACCESS_KEY_ID ? {
// //         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
// //         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// //       } : undefined
// //     });
// //   } catch (e) {
// //     console.warn('[uploads] Failed to init S3 client', e && e.message ? e.message : e);
// //     s3 = null;
// //   }
// // } else {
// //   console.warn('[uploads] AWS_S3_BUCKET not set — upload endpoint will return 500 until configured.');
// // }

// // // POST /uploads/photo
// // // If you want to protect uploads, add requireAuth as second param: router.post('/photo', requireAuth, upload.single('file'), ...)
// // router.post('/photo', upload.single('file'), async (req, res) => {
// //   try {
// //     if (!BUCKET || !s3) return res.status(500).json({ ok:false, error: 'Server upload not configured' });
// //     if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, error: 'No file uploaded' });

// //     const origName = req.file.originalname || 'photo';
// //     const ext = path.extname(origName).toLowerCase() || '';
// //     const id = randomUUID();
// //     const ymd = new Date().toISOString().slice(0,10);
// //     const key = `${UPLOAD_PREFIX}/${ymd}/${id}${ext}`;

// //     const params = {
// //       Bucket: BUCKET,
// //       Key: key,
// //       Body: req.file.buffer,
// //       ContentType: req.file.mimetype,
// //       // ACL: 'public-read' // only if you want/need object ACL and bucket permits it
// //     };

// //     await s3.send(new PutObjectCommand(params));

// //     // Build public URL (simple S3 URL — adapt if you use CloudFront or private buckets)
// //     const url = REGION === 'us-east-1'
// //       ? `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`
// //       : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;

// //     return res.json({ ok: true, url });
// //   } catch (err) {
// //     console.error('upload error', err && (err.stack || err));
// //     // multer errors sometimes appear as err.code === 'LIMIT_FILE_SIZE'
// //     if (err && err.code === 'LIMIT_FILE_SIZE') {
// //       return res.status(400).json({ ok:false, error: 'File too large' });
// //     }
// //     return res.status(500).json({ ok:false, error: 'Upload failed' });
// //   }
// // });


// // /**
// //  * POST /api/uploads
// //  * Accepts multipart/form-data (file field "file") OR JSON with { filename, dataUrl }
// //  * Returns { ok:true, url: '/uploads/xxx.png' }
// //  * please use for uploading thumnails files and teacher photo files
// //  */
// // router.post('/', upload.single('file'), async (req, res) => {
// //   try {
// //     // multipart upload
// //     if (req.file) {
// //       const urlPath = '/uploads/' + req.file.filename;
// //       return res.json({ ok: true, url: urlPath });
// //     }

// //     // fallback: base64 data in JSON body
// //     const body = req.body || {};
// //     if (body.dataUrl && body.filename) {
// //       // dataUrl format: data:[mime];base64,BASE64...
// //       const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
// //       if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });
// //       const mime = matches[1];
// //       const b64 = matches[2];
// //       const ext = path.extname(body.filename) || (mime.split('/') && '.' + mime.split('/')[1]) || '.bin';
// //       const filename = uuidv4() + ext;
// //       const filePath = path.join(UPLOADS_DIR, filename);
// //       const buffer = Buffer.from(b64, 'base64');
// //       fs.writeFileSync(filePath, buffer);
// //       const urlPath = '/uploads/' + filename;
// //       return res.json({ ok: true, url: urlPath });
// //     }

// //     return res.status(400).json({ ok:false, error:'No file provided' });
// //   } catch (err) {
// //     console.error('POST /uploads error', err);
// //     return res.status(500).json({ ok:false, error:'Server error' });
// //   }
// // });


// // module.exports = router;


// // const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // same as server.js uploads dir




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

// Config
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || '';
const UPLOAD_PREFIX = (process.env.UPLOADS_PREFIX || 'uploads').replace(/\/+$/,'');
const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10); // 5MB default
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');

// ensure local uploads dir exists (if using local)
try { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { console.warn('[uploads] mkdir failed', e && e.message); }

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    // accept images and common media types (adjust if you need video/audio)
    if (!file.mimetype) return cb(new Error('No mimetype'), false);
    // allow images, video, audio for lessons if you want
    if (!/^(image|video|audio)\//.test(file.mimetype)) {
      return cb(new Error('Only image/video/audio uploads are allowed'), false);
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
    console.warn('[uploads] S3 init failed', e && e.message);
    s3 = null;
  }
}

// helper to build S3 URL
function s3UrlFor(key) {
  if (!key) return key;
  if (REGION === 'us-east-1') return `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;
}

// POST /api/uploads/photo  (keeps compatibility with your earlier code)
router.post('/photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

    const origName = req.file.originalname || 'photo';
    const ext = path.extname(origName) || '';
    const id = randomUUID();
    const ymd = new Date().toISOString().slice(0,10);
    const filename = `${id}${ext}`;

    if (s3) {
      const key = `${UPLOAD_PREFIX}/photos/${ymd}/${filename}`;
      const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
      await s3.send(new PutObjectCommand(params));
      return res.json({ ok: true, url: s3UrlFor(key) });
    } else {
      const outDir = path.join(UPLOADS_DIR, 'photos', ymd);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const filePath = path.join(outDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);
      // return path under /uploads so static middleware serves it
      const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
      return res.json({ ok: true, url: `/${rel}` });
    }
  } catch (err) {
    console.error('[uploads/photo] error', err && (err.stack || err));
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
    return res.status(500).json({ ok:false, error: 'Upload failed' });
  }
});

/**
 * POST /api/uploads
 * Accepts:
 *  - multipart/form-data (file field "file")
 *  - or JSON { filename, dataUrl } where dataUrl is data:<mime>;base64,...
 * Returns: { ok:true, url }
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // 1) multipart file upload
    if (req.file) {
      const origName = req.file.originalname || `upload-${Date.now()}`;
      const ext = path.extname(origName) || '';
      const filename = uuidv4() + ext;
      const ymd = new Date().toISOString().slice(0,10);

      if (s3) {
        const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
        const params = { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype };
        await s3.send(new PutObjectCommand(params));
        return res.json({ ok: true, url: s3UrlFor(key) });
      } else {
        const outDir = path.join(UPLOADS_DIR, ymd);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
        return res.json({ ok: true, url: `/${rel}` });
      }
    }

    // 2) JSON body dataUrl
    const body = req.body || {};
    if (body.dataUrl && body.filename) {
      const matches = String(body.dataUrl).match(/^data:(.+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ ok:false, error:'Invalid dataUrl' });
      const mime = matches[1];
      const b64 = matches[2];
      const ext = path.extname(body.filename) || (mime.split('/') && '.' + mime.split('/')[1]) || '.bin';
      const filename = uuidv4() + ext;
      const ymd = new Date().toISOString().slice(0,10);
      const buffer = Buffer.from(b64, 'base64');

      if (s3) {
        const key = `${UPLOAD_PREFIX}/${ymd}/${filename}`;
        const params = { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mime };
        await s3.send(new PutObjectCommand(params));
        return res.json({ ok:true, url: s3UrlFor(key) });
      } else {
        const outDir = path.join(UPLOADS_DIR, ymd);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, filename);
        fs.writeFileSync(filePath, buffer);
        const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
        return res.json({ ok: true, url: `/${rel}` });
      }
    }

    return res.status(400).json({ ok:false, error:'No file provided' });
  } catch (err) {
    console.error('[uploads] POST error', err && (err.stack || err));
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok:false, error: 'File too large' });
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;


// 'use strict';
// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const auth = require('../middleware/auth'); // require auth if you want only authenticated uploads

// // ensure upload folder exists
// const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
// if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, UPLOAD_DIR);
//   },
//   filename: function (req, file, cb) {
//     const ext = path.extname(file.originalname);
//     const name = Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext;
//     cb(null, name);
//   }
// });
// const upload = multer({ storage });

// // POST /api/uploads  (single file -> returns url). Auth optional.
// router.post('/', auth, upload.single('file'), (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ ok:false, message:'file required' });
//     // build public URL
//     const proto = req.protocol;
//     const host = req.get('host');
//     // if you serve /public as root static, adjust path accordingly
//     const url = `${proto}://${host}/uploads/${req.file.filename}`;
//     return res.json({ ok: true, url });
//   } catch (err) {
//     console.error('POST /uploads', err);
//     return res.status(500).json({ ok:false, message:'Server error' });
//   }
// });

// module.exports = router;
