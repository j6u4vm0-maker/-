const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Service to handle Excel export and import operations
 */
class ExcelService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Internal helper to fetch data using Promises
   */
  async _getRows(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
  }

  /**
   * Export all data to a multi-sheet backup
   */
  async exportFullBackup(res) {
    const workbook = new ExcelJS.Workbook();
    
    // 1. Setup Sheets
    const expensesSheet = workbook.addWorksheet('收支紀錄 Expenses');
    expensesSheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: '發票日期', key: 'invoice_date', width: 15 },
      { header: '報帳日期', key: 'reimbursement_date', width: 15 },
      { header: '供應商', key: 'supplier_name', width: 20 },
      { header: '分類', key: 'category_name', width: 15 },
      { header: '細目(中)', key: 'detail_zh', width: 25 },
      { header: '細目(英)', key: 'detail_en', width: 25 },
      { header: '收入', key: 'incoming', width: 10 },
      { header: '支出', key: 'outgoing', width: 10 },
      { header: '狀態', key: 'pay_status', width: 10 },
      { header: '憑證(勾選)', key: 'receipt_v', width: 10 },
      { header: '照片(上傳)', key: 'photo_v', width: 10 }
    ];

    const suppliersSheet = workbook.addWorksheet('供應商 Suppliers');
    suppliersSheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: '名稱', key: 'name', width: 30 },
      { header: '稅號', key: 'tax_id', width: 15 },
      { header: '電話', key: 'phone', width: 15 },
      { header: '地址', key: 'address', width: 40 }
    ];

    const categoriesSheet = workbook.addWorksheet('費用類別 Categories');
    categoriesSheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: '中文名稱', key: 'name_zh', width: 20 },
      { header: '英文名稱', key: 'name_en', width: 20 },
      { header: '會計科目', key: 'account_code', width: 15 }
    ];

    const personnelSheet = workbook.addWorksheet('人員名單 Personnel');
    personnelSheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: '姓名', key: 'name', width: 20 }
    ];

    // 2. Fetch Data
    const [expenses, suppliers, categories, personnel] = await Promise.all([
      this._getRows(`SELECT e.*, s.name as supplier_name, c.name_zh as category_name FROM expenses e LEFT JOIN suppliers s ON e.supplier_id = s.id LEFT JOIN categories c ON e.category_id = c.id`),
      this._getRows(`SELECT * FROM suppliers`),
      this._getRows(`SELECT * FROM categories`),
      this._getRows(`SELECT * FROM personnel`)
    ]);

    // 3. Add Rows
    expensesSheet.addRows(expenses.map(e => ({
      ...e,
      receipt_v: e.has_bill === 1 ? 'V' : '-',
      photo_v: e.image_path ? 'V' : '-'
    })));
    suppliersSheet.addRows(suppliers);
    categoriesSheet.addRows(categories);
    personnelSheet.addRows(personnel);

    // 4. Write to Response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=full_database_backup.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Export expenses with photos (Report v2)
   */
  async exportFinancialReportV2(rows, res) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Petty Cash Log');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: '發票日期 (Date)', key: 'invoice_date', width: 15 },
      { header: '報帳日期 (Reimburse)', key: 'reimbursement_date', width: 15 },
      { header: '會計科目 (Account)', key: 'account_code', width: 15 },
      { header: '供應商 (Supplier)', key: 'supplier_name', width: 20 },
      { header: '分類 (Category)', key: 'category_name', width: 20 },
      { header: '細目-中 (Detail ZH)', key: 'detail_zh', width: 25 },
      { header: '細目-英 (Detail EN)', key: 'detail_en', width: 25 },
      { header: '報帳人 (Personnel)', key: 'personnel_name', width: 15 },
      { header: '收入 (In)', key: 'incoming', width: 10 },
      { header: '支出 (Out)', key: 'outgoing', width: 10 },
      { header: '狀態 (Status)', key: 'pay_status', width: 10 },
      { header: '憑證 (Bill)', key: 'receipt_v', width: 10 },
      { header: '照片 (Photo)', key: 'photo_v', width: 10 }
    ];

    rows.forEach(row => {
      sheet.addRow({
        ...row,
        receipt_v: row.has_bill === 1 ? 'V' : '-',
        photo_v: row.image_path ? 'V' : '-'
      });
    });

    const imageSheet = workbook.addWorksheet('憑證照片 Receipts');
    const imagesPerRow = 2;
    const imgWidth = 400;
    const imgHeight = 300;
    const colWidth = 60;
    const rowHeight = 250;

    imageSheet.getColumn(1).width = colWidth;
    imageSheet.getColumn(3).width = colWidth;

    let currentImgCount = 0;
    for (const row of rows) {
      if (row.image_path) {
        const fullPath = path.join(__dirname, '..', row.image_path);
        if (fs.existsSync(fullPath)) {
          try {
            const imageId = workbook.addImage({
              buffer: fs.readFileSync(fullPath),
              extension: path.extname(fullPath).substring(1) || 'png',
            });

            const colIdx = (currentImgCount % imagesPerRow) * 2 + 1;
            const rowIdx = Math.floor(currentImgCount / imagesPerRow) * 2 + 1;

            const labelCell = imageSheet.getRow(rowIdx).getCell(colIdx);
            labelCell.value = `SN #${row.id} - ${row.supplier_name} (${row.invoice_date})`;
            labelCell.font = { bold: true, size: 12 };

            imageSheet.addImage(imageId, {
              tl: { col: colIdx - 0.9, row: rowIdx },
              ext: { width: imgWidth, height: imgHeight }
            });

            imageSheet.getRow(rowIdx + 1).height = rowHeight;
            currentImgCount++;
          } catch (e) {
            console.error('[ExcelService] Error adding image:', e);
          }
        }
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=financial_report_v2.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Import expenses from Excel
   */
  async importExpenses(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(1);
    let importCount = 0;

    const formatDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : d.toISOString().split('T')[0];
      }
      return val;
    };

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.getCell(1).value && !row.getCell(2).value) continue;

      const data = {
        invoiceDate: formatDate(row.getCell(2).value),
        reimburseDate: formatDate(row.getCell(3).value),
        accountCode: row.getCell(4).value,
        supplier: row.getCell(5).value,
        category: row.getCell(6).value,
        detailZh: row.getCell(7).value,
        detailEn: row.getCell(8).value,
        personnel: row.getCell(9).value,
        incoming: parseFloat(row.getCell(10).value) || 0,
        outgoing: parseFloat(row.getCell(11).value) || 0,
        status: row.getCell(12).value || 'PAID'
      };

      if (!data.invoiceDate && !data.reimburseDate) continue;

      // This part still needs DB interaction, usually handled in the route or model
      // For now, we return the parsed rows or handle them sequentially
      await this._insertImportedRow(data);
      importCount++;
    }
    return importCount;
  }

  async _insertImportedRow(d) {
    return new Promise((resolve) => {
      this.db.serialize(() => {
        this.db.get("SELECT id FROM suppliers WHERE name = ?", [d.supplier], (err, s) => {
          this.db.get("SELECT id FROM categories WHERE name_zh = ? OR account_code = ?", [d.category, d.accountCode], (err, c) => {
            this.db.get("SELECT id FROM personnel WHERE name = ?", [d.personnel], (err, p) => {
              const sql = `INSERT INTO expenses (invoice_date, reimbursement_date, supplier_id, category_id, detail_zh, detail_en, personnel_id, incoming, outgoing, pay_status) VALUES (?,?,?,?,?,?,?,?,?,?)`;
              this.db.run(sql, [d.invoiceDate, d.reimburseDate, s?.id, c?.id, d.detailZh, d.detailEn, p?.id, d.incoming, d.outgoing, d.status], resolve);
            });
          });
        });
      });
    });
  }
}

module.exports = ExcelService;
