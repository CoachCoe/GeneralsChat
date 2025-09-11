import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import { FileUpload } from '@/types';

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, TXT, and image files are allowed.'));
    }
  }
});

export async function saveFileToDatabase(
  file: Express.Multer.File,
  incidentId?: string,
  conversationId?: string,
  uploadedBy: string
): Promise<FileUpload> {
  const fileRecord = await prisma.attachment.create({
    data: {
      incidentId,
      conversationId,
      filename: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedBy,
    },
  });

  return {
    filename: fileRecord.filename,
    filePath: fileRecord.filePath,
    fileType: fileRecord.fileType || '',
    fileSize: fileRecord.fileSize || 0,
    uploadedBy: fileRecord.uploadedBy,
    createdAt: fileRecord.createdAt,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  const file = await prisma.attachment.findUnique({
    where: { id: fileId },
  });

  if (file) {
    // Delete physical file
    try {
      await promisify(fs.unlink)(file.filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete database record
    await prisma.attachment.delete({
      where: { id: fileId },
    });
  }
}

export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function isImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  return imageExtensions.includes(getFileExtension(filename));
}

export function isDocumentFile(filename: string): boolean {
  const docExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
  return docExtensions.includes(getFileExtension(filename));
}
