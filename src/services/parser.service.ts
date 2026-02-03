import { ReceiptData } from '../types/receipt.js';
import { logger } from '../config/logger.js';

export class ReceiptParser {
  /**
   * Parse raw OCR text to extract receipt information
   */
  parse(rawText: string): ReceiptData {
    logger.info('[Parser] Parsing receipt data...');

    const data: ReceiptData = {
      rawText,
    };

    // Helper to parse currency strings (e.g., "$1,234.56" -> 1234.56)
    const parseCurrency = (str: string): number => {
      return parseFloat(str.replace(/[$,]/g, ''));
    };

    // 1. Extract Total Amount
    // Matches: "Total: $123.45", "TOTAL 123.45", etc.
    const totalMatch = rawText.match(/total.*?\$?([\d,]+\.?\d*)/i);
    if (totalMatch && totalMatch[1]) {
      data.amount = parseCurrency(totalMatch[1]);
    }

    // 2. Extract Subtotal
    const subtotalMatch = rawText.match(/subtotal.*?\$?([\d,]+\.?\d*)/i);
    if (subtotalMatch && subtotalMatch[1]) {
      data.subtotalAmount = parseCurrency(subtotalMatch[1]);
    }

    // 3. Extract Tax
    // Matches "Tax", "Impuesto", "IVA"
    const taxMatch = rawText.match(/(?:tax|impuesto|iva).*?\$?([\d,]+\.?\d*)/i);
    if (taxMatch && taxMatch[1]) {
      data.taxAmount = parseCurrency(taxMatch[1]);
    }

    // 4. Extract Invoice Number
    // Matches "Invoice #123", "Factura A-123", "Ticket #123"
    const invoiceMatch = rawText.match(/(?:invoice|factura|ticket|recibo)\s*#?\s*([a-zA-Z0-9-]+)/i);
    if (invoiceMatch && invoiceMatch[1]) {
      data.invoiceNumber = invoiceMatch[1];
    }

    // 5. Extract Date
    // Matches DD/MM/YYYY or MM/DD/YYYY or similar formats
    const dateMatch = rawText.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
    if (dateMatch && dateMatch[1]) {
      data.date = dateMatch[1];
    }

    // 6. Vendor Name Heuristic
    // Assume the first non-empty line is the vendor name
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      data.vendorName = lines[0];
    }

    // 7. Calculate Tax Percentage if possible
    if (data.taxAmount && data.subtotalAmount) {
      data.taxPercentage = parseFloat(((data.taxAmount / data.subtotalAmount) * 100).toFixed(2));
    }

    return data;
  }
}
