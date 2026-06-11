const express = require('express');
const { auth, adminOnly } = require('../middleware/auth');
const { getRates, saveRates, logActivity } = require('../utils/helpers');

const router = express.Router();

// 1. Get current rates configuration
router.get('/rates', auth, (req, res) => {
  try {
    const rates = getRates();
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read rates: ' + err.message });
  }
});

// 2. Update rates configuration (Admin Only)
router.post('/rates', auth, adminOnly, async (req, res) => {
  try {
    const { print_bw, print_color, copy_bw, copy_color, scan } = req.body;
    
    // Validation
    const updatedRates = {
      print_bw: parseFloat(print_bw),
      print_color: parseFloat(print_color),
      copy_bw: parseFloat(copy_bw),
      copy_color: parseFloat(copy_color),
      scan: parseFloat(scan)
    };

    for (const key of Object.keys(updatedRates)) {
      if (isNaN(updatedRates[key])) {
        return res.status(400).json({ error: `Invalid rate value for ${key}. Must be a number.` });
      }
      if (updatedRates[key] < 0) {
        return res.status(400).json({ error: `อัตราค่าบริการสำหรับ ${key} ต้องมีค่ามากกว่าหรือเท่ากับ 0` });
      }
    }

    const oldRates = getRates();
    saveRates(updatedRates);

    const logDetails = [];
    if (oldRates.print_bw !== updatedRates.print_bw) logDetails.push(`Print ขาวดำ: ${oldRates.print_bw} -> ${updatedRates.print_bw}`);
    if (oldRates.print_color !== updatedRates.print_color) logDetails.push(`Print สี: ${oldRates.print_color} -> ${updatedRates.print_color}`);
    if (oldRates.copy_bw !== updatedRates.copy_bw) logDetails.push(`Copy ขาวดำ: ${oldRates.copy_bw} -> ${updatedRates.copy_bw}`);
    if (oldRates.copy_color !== updatedRates.copy_color) logDetails.push(`Copy สี: ${oldRates.copy_color} -> ${updatedRates.copy_color}`);
    if (oldRates.scan !== updatedRates.scan) logDetails.push(`สแกน: ${oldRates.scan} -> ${updatedRates.scan}`);

    const detailsStr = logDetails.length > 0 ? `เปลี่ยนอัตราค่าบริการ: ${logDetails.join(', ')}` : 'บันทึกอัตราค่าบริการเดิมโดยไม่มีการเปลี่ยนแปลง';
    await logActivity(req.username, req.role, 'UPDATE_RATES', detailsStr);

    res.json({ message: 'Rates updated successfully.', rates: updatedRates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rates: ' + err.message });
  }
});

module.exports = router;
