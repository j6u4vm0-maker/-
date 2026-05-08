const express = require('express');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

module.exports = (db, excelService) => {
  const router = express.Router();

  // Get Expenses with Filters
  router.get('/expenses', (req, res) => {
    const { is_archived } = req.query;
    let sql = `
      SELECT e.*, 
             COALESCE(e.supplier_name, s.name) as display_name, 
             c.name_zh as category_name, 
             c.name_en as category_name_en,
             p.name as personnel_name
      FROM expenses e
      LEFT JOIN suppliers s ON e.supplier_id = s.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN personnel p ON e.personnel_id = p.id
      WHERE e.is_archived = ?
      ORDER BY e.invoice_date DESC, e.id DESC
    `;
    db.all(sql, [is_archived === 'true' ? 1 : 0], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const processed = rows.map(r => ({ 
        ...r, 
        supplier_name: r.display_name,
        // Double check mapping here
        category_name: r.category_name,
        category_name_en: r.category_name_en || r.category_name 
      }));
      res.json(processed);
    });
  });

  // Create Expense
  router.post('/expenses', upload.single('receipt'), (req, res) => {
    const { 
      invoice_date, reimbursement_date, supplier_id, supplier_name, category_id, 
      detail_en, detail_zh, personnel_id, incoming, outgoing, has_bill, pay_status,
      no_bill_reason_zh, no_bill_reason_en, ai_raw_text
    } = req.body;
    
    const image_path = req.file ? `/uploads/${req.file.filename}` : req.body.image_path;

    const insertExpense = (sid, sname) => {
      const sql = `INSERT INTO expenses (
        invoice_date, reimbursement_date, supplier_id, supplier_name, category_id, 
        detail_en, detail_zh, personnel_id, incoming, outgoing, 
        has_bill, pay_status, image_path, ai_raw_text,
        no_bill_reason_zh, no_bill_reason_en
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      
      const params = [
        invoice_date, reimbursement_date, sid, sname, category_id, 
        detail_en, detail_zh, personnel_id, parseFloat(incoming) || 0, parseFloat(outgoing) || 0, 
        has_bill === 'true' || has_bill === true ? 1 : 0, pay_status, image_path, ai_raw_text,
        no_bill_reason_zh, no_bill_reason_en
      ];

      db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
      });
    };

    if (supplier_id) {
      db.get("SELECT name FROM suppliers WHERE id = ?", [supplier_id], (err, row) => {
        insertExpense(supplier_id, row ? row.name : null);
      });
    } else if (supplier_name) {
      // Just check if it exists to link the ID, but NEVER insert into suppliers
      db.get("SELECT id FROM suppliers WHERE name = ?", [supplier_name], (err, row) => {
        insertExpense(row ? row.id : null, supplier_name);
      });
    } else {
      insertExpense(null, null);
    }
  });

  // Update Expense
  router.put('/expenses/:id', upload.single('receipt'), (req, res) => {
    const id = req.params.id;
    const body = req.body;
    
    // Build update query dynamically based on provided fields
    const fields = [];
    const params = [];
    
    const allowedFields = [
      'invoice_date', 'reimbursement_date', 'supplier_id', 'category_id', 
      'detail_en', 'detail_zh', 'personnel_id', 'incoming', 'outgoing', 
      'has_bill', 'pay_status', 'ai_raw_text', 'no_bill_reason_zh', 
      'no_bill_reason_en', 'is_archived'
    ];

    allowedFields.forEach(f => {
      if (body[f] !== undefined) {
        fields.push(`${f} = ?`);
        if (f === 'incoming' || f === 'outgoing') params.push(parseFloat(body[f]) || 0);
        else if (f === 'has_bill' || f === 'is_archived') params.push(body[f] === 'true' || body[f] === true || body[f] === 1 ? 1 : 0);
        else params.push(body[f]);
      }
    });

    if (req.file) {
      fields.push(`image_path = ?`);
      params.push(`/uploads/${req.file.filename}`);
    }

    if (fields.length === 0) return res.json({ success: true, message: 'No changes' });

    params.push(id);
    const sql = `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // Delete Expense
  router.delete('/expenses/:id', (req, res) => {
    db.run("DELETE FROM expenses WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // Batch Operations
  router.post('/expenses/batch-delete', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM expenses WHERE id IN (${placeholders})`, ids, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  router.post('/expenses/archive', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    const placeholders = ids.map(() => '?').join(',');
    db.run(`UPDATE expenses SET is_archived = 1 WHERE id IN (${placeholders})`, ids, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  router.post('/expenses/restore', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    const placeholders = ids.map(() => '?').join(',');
    db.run(`UPDATE expenses SET is_archived = 0 WHERE id IN (${placeholders})`, ids, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  router.post('/expenses/batch-pay-personnel', (req, res) => {
    const { personnel_id } = req.body;
    if (!personnel_id) return res.status(400).json({ error: 'Personnel ID required' });
    
    db.run(
      "UPDATE expenses SET pay_status = 'PAID' WHERE personnel_id = ? AND pay_status != 'PAID' AND is_archived = 0",
      [personnel_id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: this.changes });
      }
    );
  });

  // Excel Operations
  router.get('/export_all', async (req, res) => {
    try {
      await excelService.exportFullBackup(res);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/export_v2', (req, res) => {
    const { is_archived } = req.query;
    const sql = `
      SELECT e.*, s.name as supplier_name, c.name_zh as category_name, c.account_code, p.name as personnel_name
      FROM expenses e
      LEFT JOIN suppliers s ON e.supplier_id = s.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN personnel p ON e.personnel_id = p.id
      WHERE e.is_archived = ?
      ORDER BY e.invoice_date ASC, e.id ASC
    `;
    db.all(sql, [is_archived === 'true' ? 1 : 0], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      try {
        await excelService.exportFinancialReportV2(rows, res);
      } catch (excelErr) {
        res.status(500).json({ error: excelErr.message });
      }
    });
  });

  router.post('/expenses/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    try {
      const count = await excelService.importExpenses(req.file.path);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
