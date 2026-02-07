import { ReceiptData } from '../types/receipt.js';
import { logger } from '../config/logger.js';

export class ReceiptParser {
  /**
   * Analiza el texto OCR sin procesar para extraer información del recibo
   */
  parse(rawText: string): ReceiptData {
    logger.info('[Parser] Analizando datos del recibo...');
    logger.info(`[Parser] Longitud del texto sin procesar: ${rawText.length} caracteres`);

    const data: ReceiptData = {
      rawText,
    };

    // Normalizar texto para reducir errores OCR y facilitar búsquedas
    const normalize = (txt: string) => {
      return txt
        .replace(/\r/g, '\n')
        // reemplazos comunes de OCR
        .replace(/\bO(?=\d)/g, '0')
        .replace(/\bI(?=\d)/g, '1')
        .replace(/\bS(?=\d)/g, '5')
        .replace(/[\u00A0\t]+/g, ' ')
        .replace(/\u2013|\u2014/g, '-')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
    };

    const text = normalize(rawText);

    // Función auxiliar para analizar cadenas de moneda (ej., "$1,234.56" -> 1234.56)
    const parseCurrency = (str: string): number => {
      if (!str) return NaN;
      // Trim and normalize spaces
      let s = String(str).trim();

      // Remove currency symbols and surrounding text
      s = s.replace(/[^0-9,\.\-]/g, '');

      // Determine decimal separator: if both . and , present, assume . is thousand and , decimal when pattern fits
      const hasDot = s.indexOf('.') !== -1;
      const hasComma = s.indexOf(',') !== -1;

      if (hasDot && hasComma) {
        // e.g., 1.234,56 -> replace dots, comma -> dot
        if (/\d+\.\d{3},\d{2}$/.test(s) || /\d{1,3}(?:\.\d{3})+,\d{2}$/.test(s)) {
          s = s.replace(/\./g, '').replace(/,/g, '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (hasComma && !hasDot) {
        // Could be 1234,56 -> comma as decimal
        if (/\d+,\d{1,2}$/.test(s)) {
          s = s.replace(/,/g, '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else {
        // only dots or only digits
        s = s.replace(/,/g, '');
      }

      const v = parseFloat(s);
      return isNaN(v) ? NaN : v;
    };

    // --- Heurística: Encontrar todos los posibles montos monetarios ---
    const moneyPattern = /(?:\$|USD|EUR|€|GBP|£)?\s*([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?)/gi;
    const moneyMatches: number[] = [];
    let match;
    while ((match = moneyPattern.exec(rawText)) !== null) {
      if (match[1]) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val)) {
          moneyMatches.push(val);
        }
      }
    }

    const sortedAmounts = moneyMatches.sort((a, b) => b - a);
    const maxAmount = sortedAmounts.length > 0 ? sortedAmounts[0] : undefined;

    // --- Estrategia: Dividir el texto en secciones para evitar confusión con líneas de artículos ---
    // Buscar la sección "Desglose" o "Valor Total" que contiene los totales reales
    const desgloseMatch = text.match(/(desglose\s+itbms|valor\s+total|totals?|amounts?\s+breakdown)([\s\S]*)/i);
    const totalsSection = desgloseMatch ? desgloseMatch[2] : text;

    // También intentar encontrar una sección explicita de totales (ES/EN)
    const totalsSectionMatch = text.match(/(valor\s+total|total\s+pagado|desglose|totals?|amount\s+paid)([\s\S]*?)(?:forma\s+de\s+pago|payment\s+method|p[aá]gina|page|$)/i);
    const extractionText = totalsSectionMatch ? totalsSectionMatch[2] : totalsSection;

    // 1. Extraer Subtotal - Buscar en la sección de totales
    const subtotalPatterns = [
      /monto\s+gravado\s+(?:itbms|tbws)[^\d]*([\d,\.]+)?/i,
      /monto\s*base[^\d]*([\d,\.]+)?/i,
      /sub[\s-]?total[:\s]*\$?\s*([\d,\.]+)?/i,
      /subtotal[:\s]*\$?\s*([\d,\.]+)?/i,
      /importe\s*base[:\s]*\$?\s*([\d,\.]+)?/i,
      /base\s*imponible[:\s]*\$?\s*([\d,\.]+)?/i,
      /amount\s*before\s*tax[:\s]*\$?\s*([\d,\.]+)?/i,
      /amount\s*net[:\s]*\$?\s*([\d,\.]+)?/i
    ];

    for (const pattern of subtotalPatterns) {
      const subtotalMatch = extractionText.match(pattern);
      if (subtotalMatch && subtotalMatch[1]) {
        const value = parseFloat(subtotalMatch[1].replace(/,/g, ''));
        if (value > 0) {
          data.subtotalAmount = value;
          break;
        }
      }
    }

    // 2. Extraer Porcentaje de Impuesto - Buscar % en la sección de totales
    const taxPercentPatterns = [
      /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:tax|impuesto|iva|itbms|vat|gst)?/i,
      /(?:tax|impuesto|iva|itbms|vat|gst)[:\s]*(\d{1,2}(?:\.\d+)?)\s*%/i,
      /rate[:\s]*(\d{1,2}(?:\.\d+)?)\s*%/i,
      /(\d{1,2}(?:\.\d+)?)\s*%/i
    ];

    for (const pattern of taxPercentPatterns) {
      const taxPercentMatch = extractionText.match(pattern);
      if (taxPercentMatch) {
        // Obtener el valor del porcentaje (puede estar en diferentes grupos de captura)
        const percentValue = taxPercentMatch[2] || taxPercentMatch[1];
        if (percentValue) {
          const percent = parseFloat(percentValue);
          // Validar que sea un porcentaje de impuesto razonable (0-25 para la mayoría de los países)
          if (percent >= 0 && percent <= 25) {
            data.taxPercentage = percent;
            break;
          }
        }
      }
    }

    // 3. Extraer Monto de Impuesto - Buscar SOLAMENTE en la sección de totales
    const taxAmountPatterns = [
      /([\\d,]+\\.\\d{2})\\s+total\\s+([\\d,]+\\.?\\d*)/i,

      /([\d,]+\.?\d*)\s*\|\s*(\d+)\s*\|\s*([\d,]+\.?\d*)/,

      /total\s+impuesto[^\d]*([\d,]+\.?\d*)/i,
      /toul\s+impusstel[^\d]*([\d,]+\.?\d*)/i,  
      /total\s+tax[^\d]*([\d,]+\.?\d*)/i,

      /(?:itbms|impuesto|iva|vat|sales\s+tax|gst)(?!.*unitario)[^\d]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)(?:\s|$)/i,
      /tax[:\s]*([\d,\.]+)\s*(?:amount)?/i
    ];

    for (const pattern of taxAmountPatterns) {
      const taxMatch = extractionText.match(pattern);
      if (taxMatch) {
        let taxValue = null;

        if (taxMatch[3]) {
          taxValue = parseFloat(taxMatch[3].replace(/,/g, ''));
        } else if (taxMatch[2] && taxMatch[1]) {
          const val1 = parseFloat(taxMatch[1].replace(/,/g, ''));
          const val2 = parseFloat(taxMatch[2].replace(/,/g, ''));
          taxValue = val1 < val2 ? val1 : null; // Tomar el valor más pequeño como impuesto
        } else if (taxMatch[1]) {
          taxValue = parseFloat(taxMatch[1].replace(/,/g, ''));
        }

        if (taxValue !== null && taxValue >= 0) {
          if (!data.amount || taxValue < data.amount) {
            if (!data.subtotalAmount || taxValue < data.subtotalAmount) {
              data.taxAmount = taxValue;
              break;
            }
          }
        }
      }
    }

    // 4. Extraer Monto Total
    const totalPatterns = [
      /total\s+pagado[:\s]*\$?\s*([\d,\.]+)/i,
      /valor\s+total[:\s]*\$?\s*([\d,\.]+)/i,
      /total(?:\s+a\s+pagar)?[:\s]*\$?\s*([\d,\.]+)/i,
      /total\s+general[:\s]*\$?\s*([\d,\.]+)/i,
      /importe\s+total[:\s]*\$?\s*([\d,\.]+)/i,
      /gran\s+total[:\s]*\$?\s*([\d,\.]+)/i,
      /amount\s+paid[:\s]*\$?\s*([\d,\.]+)/i,
      /total[:\s]*\$?\s*([\d,\.]+)/i
    ];

    for (const pattern of totalPatterns) {
      const totalMatch = rawText.match(pattern);
      if (totalMatch && totalMatch[1]) {
        const parsed = parseCurrency(totalMatch[1]);
        if (!isNaN(parsed)) {
          data.amount = parsed;
          break;
        }
      }
    }

    // Fallback: Usar el monto más grande si no se encuentra el total
    if (!data.amount && maxAmount) {
      data.amount = maxAmount;
    }

    // Limpiar Total: A veces el OCR agrega decimales extraños (ej. 199.656 -> 199.66)
    if (data.amount) {
      data.amount = parseFloat(data.amount.toFixed(2));
    }

    // 5. Extraer Fecha
    const labeledDatePattern = /(?:fecha|date|fecha\s+de)[^\dA-Za-z]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i;
    const labeledDateMatch = text.match(labeledDatePattern);

    if (labeledDateMatch && labeledDateMatch[1]) {
      data.date = labeledDateMatch[1];
    } else {
      const monthNames = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)';
      const datePattern = new RegExp('(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})|(?:(?:' + monthNames + ')\\s+\\d{1,2},?\\s+\\d{4})','i');
      const dateMatch = text.match(datePattern);
      if (dateMatch) {
        data.date = dateMatch[0];
      }
    }

    // 6. Extraer Nombre del Vendedor - Múltiples estrategias
    const vendorPatterns = [
      /(?:emisor|raz[oó]n\s+social|rnc|nit)[:\s]*([^\n]+)/i,
      /(?:vendor|vendedor|supplier|supplier\s+name|nombre)[:\s]*([^\n]+)/i,
      /(?:empresa|company|business)[:\s]*([^\n]+)/i,
      /(?:nombre\s+comercial|trade\s+name)[:\s]*([^\n]+)/i
    ];

    for (const pattern of vendorPatterns) {
      const vendorMatch = rawText.match(pattern);
      if (vendorMatch && vendorMatch[1]) {
        data.vendorName = vendorMatch[1].trim();
        break;
      }
    }

    // Fallback: Primera línea no vacía que no sea un encabezado
    if (!data.vendorName) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const skipPatterns = [
        /factura/i, /invoice/i, /receipt/i, /comprobante/i,
        /fecha/i, /date/i, /folio/i, /pag[ia]na/i, /http/i,
        /^\d+$/, /^[A-Z]$/, /ticket/i
      ];

      for (const line of lines) {
        if (line.length < 3 || skipPatterns.some(p => p.test(line))) {
          continue;
        }
        // Prefer lines with letters and at least two words (company names)
        if (/\d/.test(line) && /[A-Za-z]/.test(line) && line.length < 6) continue;
        data.vendorName = line;
        break;
      }
    }

    // 7. Extraer Número de Factura - Patrones completos
    const invoicePatterns = [
      /n[uú]mero[:\s]*([0-9A-Z-]{3,})/i,
      /invoice\s*(?:no\.?|n[uú]m\.?|#)?[:\s]*([0-9A-Z-]{3,})/i,
      /inv\.?\s*#[:\s]*([0-9A-Z-]{3,})/i,
      /receipt\s*#[:\s]*([0-9A-Z-]{3,})/i,
      /order\s*#[:\s]*([0-9A-Z-]{3,})/i,
      /folio[:\s#]*([0-9A-Z-]{3,})/i,
      /serie[:\s#]*([0-9A-Z-]{3,})/i,
      /consecutivo[:\s#]*([0-9A-Z-]{3,})/i
    ];

    for (const pattern of invoicePatterns) {
      const invoiceMatch = rawText.match(pattern);
      if (invoiceMatch && invoiceMatch[1]) {
        const candidate = invoiceMatch[1].trim();
        // Validar que no sea solo una fecha o palabras genéricas
        if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(candidate) &&
          !/^(electronica|interna|auxiliar)$/i.test(candidate) &&
          !/cion$/i.test(candidate) && // Excluir palabras como "Ubicacion"
          /\d/.test(candidate)) {      // Debe contener al menos un dígito
          data.invoiceNumber = candidate;
          break;
        }
      }
    }

    // --- Post-Procesamiento / Cálculos ---
    // ESTRATEGIA: Priorizar cálculos sobre valores extraídos para el monto del impuesto
    // 1. Extraer: Subtotal, % Impuesto, Total (más confiables)
    // 2. Calcular: Monto Impuesto = Subtotal × (% Impuesto / 100)
    // 3. Validar: Subtotal + Monto Impuesto ≈ Total
    // 4. Ajustar si es necesario

    logger.info('[Parser] Iniciando cálculos de post-procesamiento...');
    logger.info(`  Inicial - Subtotal: ${data.subtotalAmount}, % Impuesto: ${data.taxPercentage}, Impuesto: ${data.taxAmount}, Total: ${data.amount}`);

    // Paso 1: Manejar casos de impuesto cero
    if (data.amount && !data.taxAmount && !data.taxPercentage) {
      const zeroTaxMatch = rawText.match(/(?:itbms|tax|impuesto)[^0-9]*0+\.0+/i);
      if (zeroTaxMatch) {
        data.taxAmount = 0;
        data.taxPercentage = 0;
        data.subtotalAmount = data.amount;
        logger.info('[Parser] Factura con impuesto cero detectada');
      }
    }

    // Paso 2: Calcular Subtotal si falta
    if (!data.subtotalAmount && data.amount !== undefined && data.taxAmount !== undefined) {
      data.subtotalAmount = parseFloat((data.amount - data.taxAmount).toFixed(2));
      logger.info(`[Parser] Subtotal calculado: ${data.subtotalAmount}`);
    }

    // Paso 2.5: Calcular Subtotal desde Total y % Impuesto (Crítico cuando falta el subtotal)
    if (!data.subtotalAmount && data.amount && data.taxPercentage) {
      // Total = Subtotal * (1 + tasa)  =>  Subtotal = Total / (1 + tasa)
      const subtotal = data.amount / (1 + data.taxPercentage / 100);
      data.subtotalAmount = parseFloat(subtotal.toFixed(2));

      // También derivar el monto del impuesto si falta
      if (data.taxAmount === undefined) {
        data.taxAmount = parseFloat((data.amount - data.subtotalAmount).toFixed(2));
      }
      logger.info(`[Parser] Subtotal calculado desde Total + % Impuesto: ${data.subtotalAmount}`);
    }

    // Paso 3: PRIORIDAD - Calcular Impuesto desde Subtotal × % Impuesto (más confiable)
    if (data.subtotalAmount && data.taxPercentage !== undefined) {
      const calculatedTax = parseFloat((data.subtotalAmount * (data.taxPercentage / 100)).toFixed(2));

      if (data.taxAmount !== undefined) {
        const diff = Math.abs(calculatedTax - data.taxAmount);
        if (diff > 0.05) {
          logger.info(`[Parser] ¡Discrepancia en impuesto! Extraído: ${data.taxAmount}, Calculado: ${calculatedTax}. Usando calculado.`);
          data.taxAmount = calculatedTax;
        }
      } else {
        data.taxAmount = calculatedTax;
        logger.info(`[Parser] Impuesto calculado: ${data.taxAmount}`);
      }
    }

    // Paso 4: Calcular Impuesto desde Total - Subtotal si aún falta
    if (data.taxAmount === undefined && data.amount && data.subtotalAmount) {
      data.taxAmount = parseFloat((data.amount - data.subtotalAmount).toFixed(2));
      logger.info(`[Parser] Impuesto calculado desde Total - Subtotal: ${data.taxAmount}`);
    }

    // Paso 5: Calcular % Impuesto si falta
    if (!data.taxPercentage && data.taxAmount !== undefined && data.subtotalAmount && data.subtotalAmount > 0) {
      data.taxPercentage = parseFloat(((data.taxAmount / data.subtotalAmount) * 100).toFixed(2));
      logger.info(`[Parser] % Impuesto calculado: ${data.taxPercentage}%`);
    }

    // Paso 6: Calcular Total si falta
    if (!data.amount && data.subtotalAmount && data.taxAmount !== undefined) {
      data.amount = parseFloat((data.subtotalAmount + data.taxAmount).toFixed(2));
      logger.info(`[Parser] Total calculado: ${data.amount}`);
    }

    // Paso 7: Validar Subtotal + Impuesto ≈ Total
    if (data.subtotalAmount && data.taxAmount !== undefined && data.amount) {
      const calculatedTotal = parseFloat((data.subtotalAmount + data.taxAmount).toFixed(2));
      const diff = Math.abs(calculatedTotal - data.amount);

      if (diff > 0.10) {
        logger.warn(`[Parser] ADVERTENCIA: ¡Discrepancia en Total! ${data.subtotalAmount} + ${data.taxAmount} = ${calculatedTotal}, pero Total = ${data.amount}`);
        data.taxAmount = parseFloat((data.amount - data.subtotalAmount).toFixed(2));
        if (data.subtotalAmount > 0) {
          data.taxPercentage = parseFloat(((data.taxAmount / data.subtotalAmount) * 100).toFixed(2));
        }
        logger.info(`[Parser] Impuesto ajustado: ${data.taxAmount} (${data.taxPercentage}%)`);
      } else {
        logger.info(`[Parser] Validación exitosa: ${data.subtotalAmount} + ${data.taxAmount} ≈ ${data.amount}`);
      }
    }

    // Paso 8: Fallback
    if (!data.subtotalAmount && data.amount !== undefined) {
      // Intento final: Si hay múltiples montos detectados, el segundo más grande podría ser el subtotal
      if (sortedAmounts.length > 1 && sortedAmounts[1] < data.amount && sortedAmounts[1] > 0) {
        data.subtotalAmount = sortedAmounts[1];
        logger.info(`[Parser] Fallback Heurístico: Usando el segundo monto más grande como Subtotal: ${data.subtotalAmount}`);

        // Recalcular impuesto basado en este nuevo subtotal
        if (!data.taxAmount) {
          data.taxAmount = parseFloat((data.amount - data.subtotalAmount).toFixed(2));
        }
      } else {
        data.subtotalAmount = data.amount;
        logger.info(`[Parser] Fallback: Subtotal = Total`);
      }
    }

    logger.info('[Parser] Extracción completada:');
    logger.info(`  - Vendedor: ${data.vendorName || 'N/A'}`);
    logger.info(`  - Factura: ${data.invoiceNumber || 'N/A'}`);
    logger.info(`  - Fecha: ${data.date || 'N/A'}`);
    logger.info(`  - Subtotal: ${data.subtotalAmount || 'N/A'}`);
    logger.info(`  - Impuesto: ${data.taxAmount || 'N/A'} (${data.taxPercentage || 'N/A'}%)`);
    logger.info(`  - Total: ${data.amount || 'N/A'}`);

    return data;
  }
}