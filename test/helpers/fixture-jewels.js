'use strict';
// Parse the sheet snapshot into { id, allowedChars, substats } like the app does
// (ID / AllowedChars / SubstatN / ValueN columns).
const sheet = require('../fixtures/sheet-main.json');

function loadJewels() {
  const labels = sheet.table.cols.map((c) => (c.label || '').trim());
  const col = (name) => labels.indexOf(name);
  return sheet.table.rows.map((r) => {
    const v = (i) => (i >= 0 && r.c[i] ? r.c[i].v : null);
    const substats = [];
    for (let s = 1; s <= 5; s++) {
      const name = v(col('Substat' + s));
      if (name != null && String(name).trim()) substats.push({ name: String(name).trim(), value: Number(v(col('Value' + s))) || 0 });
    }
    return { id: String(v(col('ID')) || '').trim(), allowedChars: String(v(col('AllowedChars')) || '').trim(), substats };
  }).filter((j) => j.id && j.substats.length);
}

module.exports = { loadJewels };
