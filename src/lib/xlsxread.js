// Citește un fișier .xlsx simplu (ca backup-ul trimis de bot) fără biblioteci mari: zip + XML.
import { unzipSync, strFromU8 } from 'fflate'

const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function readXlsx(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name.startsWith('xl/') && (f.name.endsWith('.xml') || f.name.endsWith('.rels')) })
  const xml = (name) => (files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml') : null)
  const wb = xml('xl/workbook.xml')
  if (!wb) throw new Error('not_xlsx')
  const rels = xml('xl/_rels/workbook.xml.rels')
  const relMap = {}
  for (const r of rels?.getElementsByTagName('Relationship') || []) relMap[r.getAttribute('Id')] = r.getAttribute('Target')
  const sst = []
  const ss = xml('xl/sharedStrings.xml')
  for (const si of ss?.getElementsByTagName('si') || []) sst.push([...si.getElementsByTagName('t')].map((x) => x.textContent).join(''))

  const sheets = {}
  for (const sh of wb.getElementsByTagName('sheet')) {
    const name = sh.getAttribute('name')
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    let target = relMap[rid] || ''
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')
    const doc = xml(target)
    if (!doc) continue
    const rows = []
    for (const row of doc.getElementsByTagName('row')) {
      const out = []
      for (const c of row.getElementsByTagName('c')) {
        const i = colIndex(c.getAttribute('r') || '')
        const tp = c.getAttribute('t')
        const v = c.getElementsByTagName('v')[0]?.textContent
        let val
        if (tp === 's') val = sst[Number(v)] ?? ''
        else if (tp === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('')
        else if (tp === 'b') val = v === '1'
        else if (tp === 'str' || tp === 'e') val = v ?? ''
        else val = v === undefined ? '' : Number(v)
        out[i >= 0 ? i : out.length] = val
      }
      rows.push(out)
    }
    // primul rând = antetul
    const [head = [], ...body] = rows
    sheets[name] = body.filter((r) => r.some((x) => x !== '' && x !== undefined)).map((r) => Object.fromEntries(head.map((h, i) => [String(h ?? ''), r[i] ?? ''])))
  }
  return sheets
}
