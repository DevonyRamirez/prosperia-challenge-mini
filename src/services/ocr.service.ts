import { createWorker, PSM } from 'tesseract.js';
import { logger } from '../config/logger.js';
import fs from 'fs/promises'; // Usaremos fs para detectar el tipo de archivo real

export interface OcrProvider {
  extractText(imagePath: string): Promise<string>;
}

export class TesseractOcr implements OcrProvider {
  async extractText(imagePath: string): Promise<string> {
    logger.info(`[OCR] Iniciando extracción para: ${imagePath}`);

    // 1. Detectar si es PDF leyendo el contenido del archivo (no solo la extensión)
    const isActuallyPdf = await this.isPdfFile(imagePath);

    // 2. Inicializar el worker
    // Importante: createWorker ahora es una función asíncrona que retorna un worker
    const worker = await createWorker(['eng', 'spa']);

    // Configurar parámetros para mejorar la lectura de recibos
    // psm: 6 (Assume a single uniform block of text) - Ayuda con recibos largos
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    try {
      let fullText = '';

      if (isActuallyPdf) {
        logger.info(`[OCR] PDF detectado por contenido. Convirtiendo páginas...`);
        const { pdf } = await import('pdf-to-img');

        // Aumentar escala a 3.0 para mejor resolución en texto pequeño
        const document = await pdf(imagePath, { scale: 3.0 });

        let pageNum = 1;
        for await (const image of document) {
          logger.info(`[OCR] Procesando página PDF ${pageNum}...`);
          const { data: { text } } = await worker.recognize(image);
          fullText += text + '\n\n';
          pageNum++;
        }
      } else {
        // Es una imagen directa (o eso esperamos)
        logger.info(`[OCR] Procesando como imagen directa...`);
        const { data: { text } } = await worker.recognize(imagePath);
        fullText = text;
      }

      await worker.terminate();
      return fullText;

    } catch (error) {
      if (worker) await worker.terminate();
      logger.error(`[OCR] Error durante la extracción: ${error}`);
      throw error;
    }
  }

  /**
   * Método privado para verificar si un archivo es PDF 
   * analizando los primeros 4 bytes (%PDF)
   */
  private async isPdfFile(filePath: string): Promise<boolean> {
    try {
      const fileHandle = await fs.open(filePath, 'r');
      const { buffer } = await fileHandle.read(Buffer.alloc(4), 0, 4, 0);
      await fileHandle.close();
      return buffer.toString() === '%PDF';
    } catch (error) {
      return false;
    }
  }
}

// Actualizado para incluir MockOcr si lo necesitas para el challenge
export class MockOcr implements OcrProvider {
  async extractText(_imagePath: string): Promise<string> {
    return "MOCK TEXT: TOTAL $88.00";
  }
}

export function getOcrProvider(type: string = 'tesseract'): OcrProvider {
  if (type === 'tesseract') {
    return new TesseractOcr();
  }
  return new MockOcr();
}