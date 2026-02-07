# Mini Prosperia Challenge 🎓

¡Bienvenido al **Mini Prosperia Challenge**! Este es un desafío simplificado a nivel de pasantía donde construirás un sistema de OCR y extracción de datos de recibos.

**Objetivo:** Carga imágenes/PDFs de recibos y extrae información financiera clave usando **Tesseract OCR** y análisis de texto básico.

## ✨ Características y Evaluación (Implementado)

Esta solución ha sido completada cumpliendo con los siguientes criterios:

### 1. 🎯 Precisión
- **Extracción Inteligente**: Todo el código de `parser.service.ts` optimizado para encontrar Totales, Subtotales e Impuestos.
- **Validación Matemática**: Verificación cruzada (Subtotal + Impuesto ≈ Total) para corregir errores de OCR.
- **Soporte de Campos**: Identifica Vendedor, Número de Factura (especial para Panamá), Fecha (múltiples formatos) y Desglose de Impuestos.

### 2. 🛡️ Robustez
- **Manejo de Errores OCR**: Lógica avanzada para corregir malinterpretaciones comunes (ej. "Total Impusstol", "035" -> "0.35").
- **Fallbacks**: Estrategias de respaldo cuando faltan etiquetas claras y limpieza de decimales extraños en Totales.
- **Formato Flexible**: Funciona con imágenes y PDFs (conversión de alta resolución escala 3.0), multilenguaje (Eng/Esp).

### 3. 💾 Funcionalidad
- **Historial Persistente**: Guardado automático de recibos procesados en `localStorage` con borrado de historial.
- **Soporte PDF Real**: Conversión de alta resolución para leer recibos pequeños o complejos.
- **API JSON**: Respuestas estructuradas y tipadas.

### 4. 💻 Calidad de Código
- **TypeScript**: Tipado estricto en todo el proyecto.
- **Logging**: Trazabilidad detallada del proceso de extracción en consola (en Español).
- **Manejo de Errores**: Respuestas claras ante fallos de OCR.

---

## 📋 Lo que Construirás

Crearás un mini gestor de gastos que:

1. **Acepta cargas de imágenes/PDF** a través de una interfaz web simple
2. **Extrae texto** de imágenes usando Tesseract OCR
3. **Analiza datos estructurados** como montos, nombres de vendedores y fechas
4. **Muestra resultados** en un formato limpio

---

## 🎯 Tareas Principales (marcadas con `TODO:` en el código)

### 1. **Implementación de Tesseract OCR**

📁 `src/services/ocr.service.ts` → `TesseractOcr.extractText()`

Extrae texto sin procesar de una imagen/PDF:

- Usa la biblioteca `Tesseract.js`
- Soporta idiomas: `eng+spa` (Inglés + Español)
- Maneja tanto imágenes como PDFs
- Retorna el texto extraído

**Pista:**

```typescript
const result = await Tesseract.recognize(imagePath, 'eng+spa');
return result.data.text;
```

---

### 2. **Analizador de Datos de Recibos**

📁 `src/services/parser.service.ts` → `ReceiptParser.parse()`

Extrae datos estructurados del texto sin procesar del OCR:

```typescript
interface ReceiptData {
  rawText: string; // Texto original extraído
  amount?: number; // Monto total (requerido)
  subtotalAmount?: number; // Subtotal antes del impuesto
  taxAmount?: number; // Monto del impuesto
  taxPercentage?: number; // Porcentaje de impuesto (ej: 10, 16)
  vendorName?: string; // Nombre de la tienda/vendedor
  invoiceNumber?: string; // Número de factura o recibo
  date?: string; // Fecha (cualquier formato está bien)
}
```

**Técnicas que puedes usar:**

- **Expresiones regulares** para encontrar patrones:
  - `total.*?\$?([\d,]+\.?\d*)/i` → Coincide con montos
  - `invoice\s*#?\s*(\w+)/i` → Coincide con números de factura
  - `\d{1,2}[/-]\d{1,2}[/-]\d{2,4}` → Coincide con fechas
- **Coincidencia de palabras clave:**
  - Busca "TOTAL", "SUBTOTAL", "TAX", "IMPUESTO", "FACTURA"
- **Heurística:**
  - El monto más grande = total
  - El nombre del vendedor generalmente está al principio
  - Múltiples números con símbolo de moneda = montos

**Ejemplo de enfoque:**

```typescript
const totalMatch = rawText.match(/total.*?\$?([\d,]+\.?\d*)/i);
if (totalMatch) {
  data.amount = parseFloat(totalMatch[1].replace(/,/g, ''));
}
```

---

### 3. **Endpoint de Carga de Recibos**

📁 `src/routes/receipts.routes.ts` → `POST /api/receipts`

Implementa el manejador de carga de archivos:

1. ✅ Valida que se cargó un archivo
2. ✅ Verifica el tipo de archivo (solo imágenes/PDFs permitidos)
3. 🔧 **TODO:** Extrae texto usando el proveedor OCR
4. 🔧 **TODO:** Analiza el texto extraído
5. 🔧 **TODO:** Almacena el resultado con ID único
6. ✅ Retorna los datos analizados como JSON

**Formato de respuesta:**

```json
{
  "id": "uuid-aqui",
  "filename": "recibo.jpg",
  "uploadedAt": "2024-01-15T10:30:00Z",
  "data": {
    "rawText": "...",
    "amount": 88.00,
    "vendorName": "Supermercado ABC",
    ...
  }
}
```

---

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 18+
- npm o yarn

### Instalación

```bash
# Clona o navega al proyecto
cd prosperia-challenge-mini

# Instala las dependencias
npm install

# Copia el archivo de ambiente
cp .env.example .env

# Inicia el servidor de desarrollo
npm run dev
```

El servidor se iniciará en `http://localhost:3000`

### Probando la API

**1. Vía Interfaz Web:**

- Abre `http://localhost:3000` en tu navegador
- Carga una imagen/PDF de recibo
- Ve los datos extraídos mostrados

**2. Vía cURL:**

```bash
curl -X POST http://localhost:3000/api/receipts \
  -F "file=@recibo.jpg"
```

**3. Vía Postman:**

- POST a `http://localhost:3000/api/receipts`
- Body: form-data con clave `file` y tu imagen

---

## 📁 Estructura del Proyecto

```
src/
  ├── config/
  │   ├── env.ts              # Variables de ambiente
  │   └── logger.ts           # Configuración de logging
  ├── services/
  │   ├── ocr.service.ts      # Tesseract OCR (TODO)
  │   └── parser.service.ts   # Extracción de datos (TODO)
  ├── routes/
  │   ├── receipts.routes.ts  # Endpoint de carga (TODO)
  │   └── health.routes.ts    # Verificación de salud
  ├── types/
  │   └── receipt.ts          # Interfaces TypeScript
  ├── utils/
  │   └── errors.ts           # Manejo de errores
  ├── app.ts                  # Configuración de Express
  └── server.ts               # Punto de entrada

public/
  └── index.html              # Interfaz web

.env.example                  # Plantilla de ambiente
```

---

## 🔧 Proveedores Disponibles

### Proveedor OCR

- **`tesseract`** (default) → Usa Tesseract OCR real
- **`mock`** → Usa OCR falso para pruebas (retorna texto de muestra)

Establécelo vía `.env`:

```
OCR_PROVIDER=tesseract
```

---

## ✅ Criterios de Evaluación

Tu implementación será evaluada en:

1. **Precisión** de los campos extraídos:
   - ¿Puede encontrar el monto total?
   - ¿Identifica el vendedor?
   - ¿Puede analizar fechas y números de factura?

2. **Calidad del Código:**
   - Tipos de TypeScript correctamente definidos
   - Manejo de errores implementado
   - Comentarios explicando lógica compleja
   - Logs para depuración

3. **Funcionalidad:**
   - La carga de archivos funciona
   - El OCR procesa imágenes correctamente
   - El analizador extrae datos confiablemente
   - La API retorna respuestas JSON apropiadas

4. **Robustez:**
   - Maneja varios formatos de recibos
   - Manejo elegante de errores
   - Funciona con diferentes idiomas (eng + spa)

---

## 🧪 Casos de Prueba

Probaremos tu implementación con:

- Recibos simples (texto claro, formato estándar)
- Recibos complejos (múltiples artículos, variaciones de impuestos)
- Diferentes idiomas (Inglés, Español)
- Varios tipos de archivo (PNG, JPG, PDF)
- Casos límite (campos faltantes, formatos inusuales)

**Muestras Incluidas:** En la carpeta `samples/` encontrarás:

- `panama-receipt.png` - Recibo de Panamá en PNG
- `Ingreso-Derma.jpg` - Comprobante de ingreso en JPG
- `PDF-TEST.pdf` - Documento de prueba en PDF

Prueba tu implementación cargando estos archivos a través de la interfaz web.

---

## 💡 Consejos y Trucos

1. **Comienza con el OCR simulado** para probar primero la lógica del analizador
2. **Usa regex para depurar:** Prueba tus patrones en herramientas de regex en línea
3. **Registra todo** durante el análisis para ver qué se está coincidiendo
4. **Maneja casos límite:** ¿Qué pasa si un monto tiene comas? ¿Símbolos de moneda diferentes?
5. **Prueba localmente** con recibos reales de tiendas
6. **No compliques:** Las regex básicas + heurística generalmente funcionan mejor

---

## 🚀 Características Bonus (Opcionales)

Si terminas temprano, considera:

- ✨ Soporte para más campos (método de pago, nombre del cajero, etc.)
- ✨ Procesamiento de múltiples recibos
- ✨ Descargar resultados como CSV/JSON
- ✨ Historial de recibos persistente (localStorage en UI)
- ✨ Mejores mensajes de error
- ✨ Pruebas unitarias para el analizador

---

## 📚 Recursos

- [Documentación de Tesseract.js](https://github.com/naptha/tesseract.js)
- [Probador de RegExp](https://regexr.com/)
- [Guía de Express.js](https://expressjs.com/)
- [Manual de TypeScript](https://www.typescriptlang.org/docs/)

---

## 🎓 Resultados de Aprendizaje

Al completar este desafío, aprenderás:

- Manejo de carga de archivos en Node.js
- Tecnología OCR con Tesseract
- Análisis de texto con expresiones regulares
- Diseño de API REST
- TypeScript para seguridad de tipos
- Manejo de errores y logging

---

## ❓ Preguntas Frecuentes

**P: ¿Puedo usar una base de datos?**  
R: No requerido. El almacenamiento en memoria está bien.

**P: ¿Qué si no puedo extraer todos los campos?**  
R: ¡Eso está bien! Extrae lo que puedas. Los datos parciales son mejores que los errores.

**P: ¿Cómo manejo PDFs?**  
R: Tesseract.js puede manejar PDFs nativamente. Solo pasa la ruta del archivo.

**P: ¿Puedo modificar la interfaz?**  
R: ¡Absolutamente! Mejórala si quieres.

---

## 🎉 ¡Buena Suerte!

¡Puedes hacerlo! Comienza con los comentarios `TODO:` y trabaja en tu camino. Si te atascas, verifica los consejos y no dudes en experimentar.

**¡Feliz codificación!** 🚀

---

**¿Preguntas?** Verifica los comentarios del código y los registros de errores. ¡Son tus amigos!
