import { createWriteStream, promises as fs } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import type { Client, ExportFormat, Movement } from '@shared/types'
import { getClient, listMovements, movementsForMonth } from './clients'
import { fontsDir } from './paths'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake')

const BRAND = '6A1F2B'
const ACCENT = 'F8A11B'
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const eur = (cents: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, useGrouping: 'always' }).format(cents / 100)
const num = (cents: number): string =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100)
const fmtDate = (iso: string | null): string => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
const typeLabel = (t: string): string => (t === 'gasto' ? 'Gasto' : 'Ingreso')
const today = (): string => fmtDate(new Date().toISOString().slice(0, 10))

function totals(movs: Movement[]): { ingresos: number; gastos: number; balance: number } {
  let ingresos = 0
  let gastos = 0
  for (const m of movs) {
    if (m.type === 'gasto') gastos += m.amount
    else ingresos += m.amount
  }
  return { ingresos, gastos, balance: ingresos - gastos }
}

/* --------------------------------- CSV --------------------------------- */

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvLine = (cells: (string | number)[]): string => cells.map(csvCell).join(';')

async function writeCsv(path: string, lines: string[]): Promise<void> {
  // BOM + punto y coma: Excel en español lo abre directamente con acentos correctos
  await fs.writeFile(path, '﻿' + lines.join('\r\n') + '\r\n', 'utf8')
}

/* -------------------------------- Excel -------------------------------- */

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

const EUR_FMT = '#,##0.00 "€";-#,##0.00 "€"'

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, cols: number): void {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 16, color: { argb: 'FF' + BRAND } }
  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { italic: true, color: { argb: 'FF666666' } }
  ws.addRow([])
}

function addTotalsRows(ws: ExcelJS.Worksheet, t: { ingresos: number; gastos: number; balance: number }, labelCol: number): void {
  ws.addRow([])
  const rows: [string, number][] = [
    ['Total ingresos', t.ingresos],
    ['Total gastos', t.gastos],
    ['Balance', t.balance]
  ]
  for (const [label, value] of rows) {
    const cells: (string | number | null)[] = Array(labelCol + 1).fill(null)
    cells[labelCol - 1] = label
    cells[labelCol] = value / 100
    const r = ws.addRow(cells)
    r.getCell(labelCol).font = { bold: true }
    r.getCell(labelCol + 1).numFmt = EUR_FMT
    r.getCell(labelCol + 1).font = { bold: true, color: { argb: label === 'Balance' ? 'FF' + BRAND : 'FF000000' } }
    if (label === 'Balance') {
      r.getCell(labelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ACCENT } }
      r.getCell(labelCol + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ACCENT } }
    }
  }
}

/* --------------------------------- PDF --------------------------------- */

function pdfPrinter(): typeof PdfPrinter {
  const dir = fontsDir()
  const inter = (f: string): string => join(dir, f)
  return new PdfPrinter({
    Inter: {
      normal: inter('Inter-Regular.ttf'),
      bold: inter('Inter-SemiBold.ttf'),
      italics: inter('Inter-Regular.ttf'),
      bolditalics: inter('Inter-SemiBold.ttf')
    },
    Oranienbaum: {
      normal: inter('Oranienbaum-Regular.ttf'),
      bold: inter('Oranienbaum-Regular.ttf'),
      italics: inter('Oranienbaum-Regular.ttf'),
      bolditalics: inter('Oranienbaum-Regular.ttf')
    }
  })
}

function writePdf(path: string, docDefinition: object): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = pdfPrinter().createPdfKitDocument(docDefinition)
      const stream = createWriteStream(path)
      stream.on('finish', () => resolve())
      stream.on('error', reject)
      doc.on('error', reject)
      doc.pipe(stream)
      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

function pdfBase(title: string, subtitle: string, content: unknown[]): object {
  return {
    pageSize: 'A4',
    pageMargins: [40, 90, 40, 50],
    info: { title, creator: 'LawChest', producer: 'LawChest' },
    defaultStyle: { font: 'Inter', fontSize: 9.5, color: '#222222' },
    header: () => ({
      margin: [40, 28, 40, 0],
      stack: [
        {
          columns: [
            { text: 'LawChest', font: 'Oranienbaum', fontSize: 22, color: '#' + BRAND },
            { text: `Generado el ${today()}`, alignment: 'right', fontSize: 8, color: '#888888', margin: [0, 10, 0, 0] }
          ]
        },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 2, lineColor: '#' + ACCENT }] }
      ]
    }),
    footer: (page: number, pages: number) => ({
      text: `Página ${page} de ${pages}`,
      alignment: 'center',
      fontSize: 8,
      color: '#999999',
      margin: [0, 15, 0, 0]
    }),
    content: [
      { text: title, font: 'Oranienbaum', fontSize: 24, color: '#' + BRAND, margin: [0, 0, 0, 2] },
      { text: subtitle, color: '#666666', margin: [0, 0, 0, 14] },
      ...content
    ],
    styles: {
      th: { bold: true, color: '#FFFFFF', fillColor: '#' + BRAND, margin: [0, 3, 0, 3] },
      section: { font: 'Oranienbaum', fontSize: 16, color: '#' + BRAND, margin: [0, 14, 0, 6] }
    }
  }
}

const tableLayout = {
  hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => '#E5E0E0',
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (row: number) => (row > 0 && row % 2 === 0 ? '#FBF7F5' : null)
}

function pdfMovementsTable(movs: Movement[]): object {
  if (movs.length === 0) return { text: 'Sin movimientos registrados.', italics: true, color: '#888888', margin: [0, 0, 0, 8] }
  return {
    table: {
      headerRows: 1,
      widths: [60, '*', 50, 75],
      body: [
        [
          { text: 'Fecha', style: 'th' },
          { text: 'Concepto', style: 'th' },
          { text: 'Tipo', style: 'th' },
          { text: 'Importe', style: 'th', alignment: 'right' }
        ],
        ...movs.map((m) => [
          fmtDate(m.date) || '—',
          m.concept,
          { text: typeLabel(m.type), color: m.type === 'gasto' ? '#B3261E' : '#1E7B34' },
          { text: (m.type === 'gasto' ? '−' : '') + eur(m.amount), alignment: 'right' }
        ])
      ]
    },
    layout: tableLayout
  }
}

function pdfTotals(t: { ingresos: number; gastos: number; balance: number }): object {
  return {
    margin: [0, 10, 0, 0],
    columns: [
      { width: '*', text: '' },
      {
        width: 220,
        table: {
          widths: ['*', 90],
          body: [
            ['Total ingresos', { text: eur(t.ingresos), alignment: 'right' }],
            ['Total gastos', { text: eur(t.gastos), alignment: 'right' }],
            [
              { text: 'Balance', bold: true, fillColor: '#' + ACCENT },
              { text: eur(t.balance), bold: true, alignment: 'right', fillColor: '#' + ACCENT, color: '#' + BRAND }
            ]
          ]
        },
        layout: 'noBorders'
      }
    ]
  }
}

/* ------------------------------ Resúmenes ------------------------------ */

export function clientSummaryFileName(clientId: number, format: ExportFormat): string {
  const c = getClient(clientId)
  return `Resumen ${c.folder} ${new Date().toISOString().slice(0, 10)}.${format}`
}

export function monthlySummaryFileName(year: number, month: number, format: ExportFormat): string {
  return `Resumen mensual ${MONTHS[month - 1]} ${year}.${format}`
}

function sortAsc(movs: Movement[]): Movement[] {
  const key = (m: Movement): string => m.date ?? m.createdAt.slice(0, 10)
  return [...movs].sort((a, b) => key(a).localeCompare(key(b)) || a.id - b.id)
}

export async function exportClientSummary(clientId: number, format: ExportFormat, path: string): Promise<void> {
  const client: Client = getClient(clientId)
  const movs = sortAsc(listMovements(clientId))
  const t = totals(movs)
  const subtitle = `Resumen del cliente · ${movs.length} movimiento${movs.length === 1 ? '' : 's'}`

  if (format === 'csv') {
    const lines = [csvLine(['Cliente', client.name])]
    for (const f of client.fields) lines.push(csvLine([f.label, f.value]))
    lines.push('', csvLine(['Fecha', 'Concepto', 'Tipo', 'Importe (€)']))
    for (const m of movs) lines.push(csvLine([fmtDate(m.date), m.concept, typeLabel(m.type), num(m.type === 'gasto' ? -m.amount : m.amount)]))
    lines.push('', csvLine(['', '', 'Total ingresos', num(t.ingresos)]), csvLine(['', '', 'Total gastos', num(t.gastos)]), csvLine(['', '', 'Balance', num(t.balance)]))
    return writeCsv(path, lines)
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'LawChest'
    const ws = wb.addWorksheet('Resumen')
    ws.columns = [{ width: 14 }, { width: 50 }, { width: 14 }, { width: 16 }]
    addTitle(ws, client.name, `${subtitle} · Generado el ${today()}`, 4)
    for (const f of client.fields) {
      const r = ws.addRow([f.label, f.value])
      r.getCell(1).font = { bold: true, color: { argb: 'FF' + BRAND } }
    }
    if (client.fields.length) ws.addRow([])
    styleHeader(ws.addRow(['Fecha', 'Concepto', 'Tipo', 'Importe']))
    for (const m of movs) {
      const r = ws.addRow([fmtDate(m.date), m.concept, typeLabel(m.type), (m.type === 'gasto' ? -m.amount : m.amount) / 100])
      r.getCell(4).numFmt = EUR_FMT
      r.getCell(3).font = { color: { argb: m.type === 'gasto' ? 'FFB3261E' : 'FF1E7B34' } }
    }
    addTotalsRows(ws, t, 3)
    await wb.xlsx.writeFile(path)
    return
  }

  const fieldsBlock = client.fields.length
    ? [
        {
          table: {
            widths: [120, '*'],
            body: client.fields.map((f) => [{ text: f.label, bold: true, color: '#' + BRAND }, f.value])
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 6]
        }
      ]
    : []
  await writePdf(
    path,
    pdfBase(client.name, subtitle, [
      ...fieldsBlock,
      { text: 'Gastos e ingresos', style: 'section' },
      pdfMovementsTable(movs),
      pdfTotals(t)
    ])
  )
}

export async function exportMonthlySummary(year: number, month: number, format: ExportFormat, path: string): Promise<void> {
  const groups = movementsForMonth(year, month).map((g) => ({ ...g, movements: sortAsc(g.movements), t: totals(g.movements) }))
  const all = totals(groups.flatMap((g) => g.movements))
  const period = `${MONTHS[month - 1]} ${year}`
  const subtitle = `${groups.length} cliente${groups.length === 1 ? '' : 's'} con movimientos · Los movimientos sin fecha cuentan en el mes en que se registraron`

  if (format === 'csv') {
    const lines = [csvLine(['Resumen mensual', period]), '', csvLine(['Cliente', 'Fecha', 'Concepto', 'Tipo', 'Importe (€)'])]
    for (const g of groups) {
      for (const m of g.movements) {
        lines.push(csvLine([g.client.name, fmtDate(m.date ?? m.createdAt), m.concept, typeLabel(m.type), num(m.type === 'gasto' ? -m.amount : m.amount)]))
      }
    }
    lines.push('', csvLine(['Cliente', 'Ingresos (€)', 'Gastos (€)', 'Balance (€)']))
    for (const g of groups) lines.push(csvLine([g.client.name, num(g.t.ingresos), num(g.t.gastos), num(g.t.balance)]))
    lines.push(csvLine(['TOTAL', num(all.ingresos), num(all.gastos), num(all.balance)]))
    return writeCsv(path, lines)
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'LawChest'
    const ws = wb.addWorksheet('Resumen')
    ws.columns = [{ width: 40 }, { width: 16 }, { width: 16 }, { width: 16 }]
    addTitle(ws, `Resumen mensual · ${period}`, `${subtitle} · Generado el ${today()}`, 4)
    styleHeader(ws.addRow(['Cliente', 'Ingresos', 'Gastos', 'Balance']))
    for (const g of groups) {
      const r = ws.addRow([g.client.name, g.t.ingresos / 100, g.t.gastos / 100, g.t.balance / 100])
      ;[2, 3, 4].forEach((i) => (r.getCell(i).numFmt = EUR_FMT))
    }
    const tr = ws.addRow(['TOTAL', all.ingresos / 100, all.gastos / 100, all.balance / 100])
    tr.eachCell((c, i) => {
      c.font = { bold: true, color: { argb: 'FF' + BRAND } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ACCENT } }
      if (i > 1) c.numFmt = EUR_FMT
    })

    const wd = wb.addWorksheet('Movimientos')
    wd.columns = [{ width: 34 }, { width: 14 }, { width: 46 }, { width: 12 }, { width: 16 }]
    addTitle(wd, `Movimientos · ${period}`, 'Detalle de cada cliente', 5)
    for (const g of groups) {
      const h = wd.addRow([g.client.name])
      h.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF' + BRAND } }
      styleHeader(wd.addRow(['Cliente', 'Fecha', 'Concepto', 'Tipo', 'Importe']))
      for (const m of g.movements) {
        const r = wd.addRow([g.client.name, fmtDate(m.date ?? m.createdAt), m.concept, typeLabel(m.type), (m.type === 'gasto' ? -m.amount : m.amount) / 100])
        r.getCell(5).numFmt = EUR_FMT
        r.getCell(4).font = { color: { argb: m.type === 'gasto' ? 'FFB3261E' : 'FF1E7B34' } }
      }
      addTotalsRows(wd, g.t, 4)
      wd.addRow([])
    }
    await wb.xlsx.writeFile(path)
    return
  }

  const content: unknown[] = []
  if (groups.length === 0) {
    content.push({ text: 'No hay movimientos registrados en este mes.', italics: true, color: '#888888' })
  } else {
    content.push(
      { text: 'Totales por cliente', style: 'section', margin: [0, 0, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 80, 80, 80],
          body: [
            [
              { text: 'Cliente', style: 'th' },
              { text: 'Ingresos', style: 'th', alignment: 'right' },
              { text: 'Gastos', style: 'th', alignment: 'right' },
              { text: 'Balance', style: 'th', alignment: 'right' }
            ],
            ...groups.map((g) => [
              g.client.name,
              { text: eur(g.t.ingresos), alignment: 'right' },
              { text: eur(g.t.gastos), alignment: 'right' },
              { text: eur(g.t.balance), alignment: 'right', bold: true }
            ]),
            [
              { text: 'TOTAL', bold: true, fillColor: '#' + ACCENT },
              { text: eur(all.ingresos), alignment: 'right', bold: true, fillColor: '#' + ACCENT },
              { text: eur(all.gastos), alignment: 'right', bold: true, fillColor: '#' + ACCENT },
              { text: eur(all.balance), alignment: 'right', bold: true, fillColor: '#' + ACCENT, color: '#' + BRAND }
            ]
          ]
        },
        layout: tableLayout
      }
    )
    for (const g of groups) {
      content.push(
        { text: g.client.name, style: 'section', margin: [0, 18, 0, 6] },
        pdfMovementsTable(g.movements.map((m) => ({ ...m, date: m.date ?? m.createdAt.slice(0, 10) }))),
        pdfTotals(g.t)
      )
    }
  }
  await writePdf(path, pdfBase(`Resumen mensual · ${period}`, subtitle, content))
}
