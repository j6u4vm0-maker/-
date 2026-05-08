const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const { getConfig } = require('../config/configManager');

// --- Google Document AI Constants ---
const GOOGLE_PROJECT_ID = '766592247498';
const GOOGLE_LOCATION = 'us'; 
const GOOGLE_PROCESSOR_ID = '900d50d7818d58b1';

let docAiClient = null;
try {
  docAiClient = new DocumentProcessorServiceClient();
  console.log('[OCRService] Google Document AI Client initialized.');
} catch (err) {
  console.error('[OCRService] Failed to init Google Document AI Client:', err.message);
}

/**
 * Professional OCR using Google Document AI
 */
async function processWithDocumentAI(imagePath) {
  if (!docAiClient) throw new Error('Document AI Client not initialized');

  const name = `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_LOCATION}/processors/${GOOGLE_PROCESSOR_ID}`;
  const imageFile = fs.readFileSync(imagePath);
  const encodedImage = Buffer.from(imageFile).toString('base64');

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg');

  const request = {
    name,
    rawDocument: {
      content: encodedImage,
      mimeType: mimeType,
    },
  };

  const [result] = await docAiClient.processDocument(request);
  const { document } = result;
  
  const getEntity = (type) => document.entities.find(e => e.type === type)?.mentionText;
  
  return {
    date: getEntity('invoice_date'),
    supplier: getEntity('supplier_name'),
    amount: parseFloat(getEntity('total_amount')?.replace(/[^0-9.]/g, '')),
    description: getEntity('line_item/description') || 'Processed via Document AI',
    text: document.text
  };
}

/**
 * Fallback OCR using Google Gemini
 */
async function processWithGemini(imagePath, mimetype) {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const imageData = fs.readFileSync(imagePath).toString('base64');
  const prompt = `You are a professional accounting assistant. Analyze this receipt/invoice image and extract data into a valid JSON object. 
  Rules:
  1. date: Format as YYYY-MM-DD.
  2. supplier: Clean name of the store/company.
  3. amount: Total amount as a number (no currency symbols).
  4. description: A clear 5-8 word English summary of what was bought.
  5. text: Full raw text found in the image.
  
  Output ONLY the JSON object:
  { "date": "YYYY-MM-DD", "supplier": "Name", "amount": 123.45, "description": "...", "text": "..." }`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageData, mimeType: mimetype } }
  ]);

  const response = await result.response;
  const jsonText = response.text().replace(/```json|```/g, '').trim();
  return JSON.parse(jsonText);
}

/**
 * Local Fallback OCR using Tesseract
 */
async function processWithTesseract(imagePath) {
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+chi_tra');

  // Basic extraction logic
  const amountMatch = text.match(/[\d,]+\.\d{2}/) || text.match(/Total\s*[:$]?\s*([\d,]+)/i);
  const dateMatch = text.match(/\d{4}[\/-]\d{2}[\/-]\d{2}/);

  return {
    text: text,
    amount: amountMatch ? parseFloat(amountMatch[1] ? amountMatch[1].replace(/,/g, '') : amountMatch[0].replace(/,/g, '')) : null,
    date: dateMatch ? dateMatch[0].replace(/\//g, '-') : null,
    supplier: text.split('\n')[0].trim(),
    description: 'Extracted via Tesseract OCR'
  };
}

/**
 * Main OCR Orchestrator
 */
async function performOCR(imagePath, mimetype) {
  // 1. Try Document AI
  if (docAiClient) {
    try {
      return await processWithDocumentAI(imagePath);
    } catch (err) {
      console.warn('[OCRService] Document AI failed, trying Gemini...', err.message);
    }
  }

  // 2. Try Gemini
  try {
    return await processWithGemini(imagePath, mimetype);
  } catch (err) {
    console.warn('[OCRService] Gemini failed, trying Tesseract...', err.message);
  }

  // 3. Last Resort: Tesseract
  return await processWithTesseract(imagePath);
}

module.exports = {
  performOCR
};
