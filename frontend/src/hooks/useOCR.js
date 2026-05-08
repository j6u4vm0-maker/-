import { useState } from 'react';
import axios from 'axios';

export const useOCR = (API_BASE, formData, setFormData) => {
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrPreview, setOcrPreview] = useState({ en: '', zh: '' });

  const translate = async (text, from = 'en', to = 'zh-TW') => {
    try {
      const res = await axios.post(`${API_BASE}/translate`, { text, from, to });
      return res.data.translated;
    } catch (e) {
      console.error('Translation failed', e);
      return text;
    }
  };


  const handleRunOCR = async (file) => {
    if (!file) {
      alert('請先上傳憑證照片 (Please upload a receipt first)');
      return false;
    }
    
    setIsOcrLoading(true);
    const fd = new FormData();
    fd.append('receipt', file);
    
    try {
      const res = await axios.post(`${API_BASE}/ocr`, fd);
      const data = res.data;
      
      if (data) {
        setFormData(prev => {
          const updated = { ...prev };
          if (data.date) updated.invoice_date = data.date;
          if (data.supplier) updated.supplier_name = data.supplier;
          if (data.amount) updated.outgoing = data.amount;
          if (data.description) updated.detail_en = data.description;
          return updated;
        });

        // Handle Translation separately for the description
        if (data.description) {
          try {
            const transRes = await axios.post(`${API_BASE}/translate`, { text: data.description });
            if (transRes.data.text) {
              setFormData(prev => ({ ...prev, detail_zh: transRes.data.text }));
              setOcrPreview({ en: data.description, zh: transRes.data.text });
            }
          } catch (te) {
            console.warn('OCR Translation failed', te);
          }
        }
        return true;
      }
    } catch (error) { 
      console.error('OCR Process failed', error);
      alert('辨識失敗，請手動輸入 (OCR Failed, please enter manually)');
      return false;
    } finally { 
      setIsOcrLoading(false); 
    }
  };

  return {
    isOcrLoading,
    ocrPreview,
    setOcrPreview,
    runOCR: handleRunOCR,
    translate
  };
};
