// Real Excel (.xlsx) files, built in the app (no internet needed).
// sheets: [{ name, columns: [{ header, key, type: 'text' | 'number' | 'money' | 'date' }], rows: [...] }]
import { zipSync, strToU8 } from 'fflate'

const esc = s => String(s ?? '')
  // Characters Excel does not allow in XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // eslint-disable-line no-control-regex
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function colName(i) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function cell(ref, value, type) {
  if (value === null || value === undefined || value === '') return ''
  const isNumber = (type === 'number' || type === 'money') && Number.isFinite(Number(value))
  if (isNumber) {
    const style = type === 'money' ? ' s="2"' : ''
    return `<c r="${ref}"${style}><v>${Number(value)}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

function sheetXml({ columns, rows }) {
  const header = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(c.header)}</t></is></c>`).join('')}</row>`
  const body = rows.map((row, r) => {
    const n = r + 2
    return `<row r="${n}">${columns.map((c, i) => cell(`${colName(i)}${n}`, typeof c.value === 'function' ? c.value(row) : row[c.key], c.type)).join('')}</row>`
  }).join('')
  const widths = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || (c.type === 'text' || !c.type ? 24 : 14)}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths}</cols>
<sheetData>${header}${body}</sheetData>
</worksheet>`
}

// Excel sheet names: max 31 chars, no []:*?/\
const safeSheetName = (name, i) => (String(name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || `Sheet${i + 1}`)

export function buildXlsx(sheets) {
  const names = sheets.map((s, i) => safeSheetName(s.name, i))
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    // Styles: 0 = normal, 1 = bold header, 2 = number with thousands separator
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s) })
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

// Ask where to save, then write the file. Returns the path, or null if cancelled.
export async function saveXlsx(defaultName, sheets) {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  const path = await save({ defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
  if (!path) return null
  await writeFile(path, buildXlsx(sheets))
  return path
}
