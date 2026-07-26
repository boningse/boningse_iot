const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PHOTO_ROOT = path.resolve(
  process.env.ALARM_PHOTO_DIR
    || path.join(process.env.IOT_DATA_ROOT || '/mnt/data1', 'iot-uploads', 'alarm-photos')
);
const MAX_PHOTO_COUNT = 10;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif'
};

const getDateDirectory = () => {
  const now = new Date();
  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join(path.sep);
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    try {
      const directory = path.join(PHOTO_ROOT, getDateDirectory());
      fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
      callback(null, directory);
    } catch (error) {
      callback(error);
    }
  },
  filename: (req, file, callback) => {
    const extension = MIME_EXTENSIONS[file.mimetype];
    callback(null, `${crypto.randomUUID()}${extension || ''}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: MAX_PHOTO_COUNT,
    fileSize: MAX_PHOTO_SIZE
  },
  fileFilter: (req, file, callback) => {
    if (!MIME_EXTENSIONS[file.mimetype]) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }
    callback(null, true);
  }
});

const uploadAlarmPhotos = (req, res, next) => {
  upload.array('photos', MAX_PHOTO_COUNT)(req, res, async (error) => {
    if (!error) return next();
    try {
      await removeFiles(req.files || []);
    } catch (_) {
      // The upload error remains the primary response.
    }
    const messages = {
      LIMIT_FILE_SIZE: '单张照片不能超过 8MB',
      LIMIT_FILE_COUNT: '一次最多上传 10 张照片',
      LIMIT_UNEXPECTED_FILE: '仅支持 JPG、PNG、WEBP、HEIC、HEIF 图片'
    };
    res.status(400).json({
      success: false,
      message: messages[error.code] || '照片上传失败'
    });
  });
};

const checksumFile = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(filePath);
  input.on('error', reject);
  input.on('data', (chunk) => hash.update(chunk));
  input.on('end', () => resolve(hash.digest('hex')));
});

const relativeStoragePath = (filePath) => {
  const relativePath = path.relative(PHOTO_ROOT, path.resolve(filePath));
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('照片存储路径无效');
  }
  return relativePath;
};

const resolveStoragePath = (storagePath) => {
  const absolutePath = path.resolve(PHOTO_ROOT, storagePath);
  if (absolutePath !== PHOTO_ROOT && !absolutePath.startsWith(`${PHOTO_ROOT}${path.sep}`)) {
    throw new Error('照片存储路径无效');
  }
  return absolutePath;
};

const removeFiles = async (files = []) => {
  await Promise.all(files.map(async (file) => {
    try {
      await fs.promises.unlink(file.path || resolveStoragePath(file.storage_path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
};

const normalizeClientType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['mini_program', 'miniprogram', 'wechat', 'wx'].includes(normalized)) return 'mini_program';
  if (normalized === 'pc' || normalized === 'web') return 'pc';
  return 'other';
};

const categoryForAction = (action, requestedCategory) => {
  if (['before', 'during', 'after', 'general'].includes(requestedCategory)) return requestedCategory;
  if (action === 'accept') return 'before';
  if (action === 'resolve') return 'after';
  if (action === 'process') return 'during';
  return 'general';
};

const insertPhotoRecords = async ({
  client,
  files,
  alarm,
  actionId,
  userId,
  action,
  clientType,
  category,
  capturedAt,
  latitude,
  longitude,
  locationText
}) => {
  const rows = [];
  for (const file of files) {
    const checksum = await checksumFile(file.path);
    const result = await client.query(
      `INSERT INTO device_alarm_photos (
         tenant_id, alarm_id, action_id, uploaded_by,
         original_name, stored_name, storage_path, mime_type, file_size,
         checksum_sha256, category, client_type, captured_at,
         latitude, longitude, location_text
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )
       RETURNING id, alarm_id, action_id, original_name, mime_type, file_size,
                 category, client_type, captured_at, latitude, longitude,
                 location_text, created_at`,
      [
        alarm.tenant_id,
        alarm.id,
        actionId,
        userId,
        String(file.originalname || 'photo').slice(0, 255),
        file.filename,
        relativeStoragePath(file.path),
        file.mimetype,
        file.size,
        checksum,
        categoryForAction(action, category),
        normalizeClientType(clientType),
        capturedAt || null,
        latitude || null,
        longitude || null,
        locationText ? String(locationText).slice(0, 255) : null
      ]
    );
    rows.push(result.rows[0]);
  }
  return rows;
};

module.exports = {
  MAX_PHOTO_COUNT,
  MAX_PHOTO_SIZE,
  PHOTO_ROOT,
  insertPhotoRecords,
  normalizeClientType,
  removeFiles,
  resolveStoragePath,
  uploadAlarmPhotos
};
