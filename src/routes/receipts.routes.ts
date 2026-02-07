import express, { Request, Response } from 'express';
// @ts-ignore
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID as uuidv4 } from 'crypto';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { getOcrProvider } from '../services/ocr.service.js';
import { ReceiptParser } from '../services/parser.service.js';
import { ReceiptResult } from '../types/receipt.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

// Setup multer for file uploads
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only images and PDFs are allowed'));
    }
  },
});

// In-memory storage (for simplicity)
const receipts = new Map<string, ReceiptResult>();

/**
 * POST /api/receipts
 * Upload a receipt image/PDF and extract information
 * TODO: Implement the endpoint
 * 1. Validate file upload
 * 2. Extract text using OCR
 * 3. Parse the extracted text
 * 4. Store the result
 * 5. Return the parsed data
 */
router.post('/api/receipts', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const file = req.file;
    const id = uuidv4();
    const uploadedAt = new Date().toISOString();

    try {

      // 1. Get OCR provider and extract text
      const ocr = getOcrProvider('tesseract');
      const rawText = await ocr.extractText(file.path);

      logger.info('\n========== RAW OCR TEXT ==========');
      logger.info(rawText);
      logger.info('==================================\n');

      // 2. Parse the extracted text
      const parser = new ReceiptParser();
      const parsedData = parser.parse(rawText);

      logger.info('\n========== PARSED JSON DATA ==========');
      logger.info(JSON.stringify(parsedData, null, 2));
      logger.info('======================================\n');

      // 3. Construct result
      const result: ReceiptResult = {
        id,
        filename: file.originalname,
        uploadedAt,
        data: parsedData,
      };

      // 4. Store result
      receipts.set(id, result);

      // 5. Return result
      res.json(result);
    } finally {
      // Cleanup: remove uploaded file
      await fs.unlink(file.path).catch((err) => {
        logger.error(`[Receipt] Failed to delete temp file ${file.path}: ${err}`);
      });
    }
  } catch (error) {
    logger.error(`[Receipt] Error uploading receipt: ${error}`);
    const appError = error instanceof AppError ? error : new AppError(500, 'Failed to process receipt');
    res.status(appError.statusCode).json({ error: appError.message });
  }
});

/**
 * GET /api/receipts/:id
 * Retrieve a previously processed receipt
 */
router.get('/api/receipts/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const receipt = receipts.get(id);

    if (!receipt) {
      throw new AppError(404, 'Receipt not found');
    }

    res.json(receipt);
  } catch (error) {
    logger.error(`[Receipt] Error fetching receipt: ${error}`);
    const appError = error instanceof AppError ? error : new AppError(500, 'Failed to fetch receipt');
    res.status(appError.statusCode).json({ error: appError.message });
  }
});

/**
 * GET /api/receipts
 * List all processed receipts
 */
router.get('/api/receipts', (req: Request, res: Response) => {
  try {
    const receiptsList = Array.from(receipts.values());
    res.json(receiptsList);
  } catch (error) {
    logger.error(`[Receipt] Error listing receipts: ${error}`);
    res.status(500).json({ error: 'Failed to list receipts' });
  }
});

export default router;
