import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface TextItem {
  str: string
  x: number
  y: number
}

// Roles that map to two consecutive people (first mic, second mic) — lowercase
const TWO_PERSON_ROLES = new Set(['microphones', 'welcoming'])

// Map role-label text → assignment key(s) (keys are lowercased for case-insensitive lookup)
const ROLE_MAP: Record<string, string[]> = {
  'chairman':                    ['chairman'],
  'reader':                      ['reader'],
  'bible reading':               ['reader'],
  'entrance attendant':          ['entranceAttendant'],
  'auditorium attendant':        ['auditoriumAttendant'],
  'hall attendant':              ['auditoriumAttendant'],
  'welcoming':                   ['welcoming1', 'welcoming2'],
  'platform':                    ['platform'],
  'microphones':                 ['mic1', 'mic2'],
  'security':                    ['security'],
  'videoconference attendant':   ['vc'],
  'audio operator':              ['audio'],
  'video operator':              ['video'],
  'audio/video operator':        ['backup'],
  'hospitality':                 ['hospitality'],
  'watchtower conductor':        ['watchtowerConductor'],
}

function lookupRole(label: string): string[] | undefined {
  return ROLE_MAP[label.toLowerCase()]
}

export type DeckhandAssignments = {
  reader?: string
  entranceAttendant?: string
  auditoriumAttendant?: string
  platform?: string
  mic1?: string
  mic2?: string
  audio?: string
  video?: string
  backup?: string
  vc?: string
}

// Deckhand fields we actually use (the others are ignored)
const USED_FIELDS = new Set<string>([
  'reader', 'entranceAttendant', 'auditoriumAttendant',
  'platform', 'mic1', 'mic2', 'audio', 'video', 'backup', 'vc',
])

const SKIP_VALUES = new Set([
  'regional convention', 'unassigned', '', 'hospitality', 'watchtower conductor',
])

const DOW_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december']

function parseDeckhandDateStr(raw: string): string | undefined {
  if (!raw) return undefined
  const firstLine = raw.split(/[\n\r]/)[0].trim()
  const withoutDow = firstLine.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*/i, '').trim()
  if (!withoutDow) return undefined
  const m = withoutDow.match(/^([A-Za-z]+)\s+(\d{1,2})/)
  if (!m) return undefined
  const monthIdx = MONTH_NAMES.indexOf(m[1].toLowerCase())
  const day = parseInt(m[2], 10)
  if (monthIdx < 0 || isNaN(day)) return undefined
  const now = new Date()
  const month = String(monthIdx + 1).padStart(2, '0')
  const dayStr = String(day).padStart(2, '0')
  const year = (monthIdx + 1 < now.getMonth() + 1) ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-${month}-${dayStr}`
}

async function extractTextItems(arrayBuffer: ArrayBuffer): Promise<TextItem[]> {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const allItems: TextItem[] = []
  const PAGE_Y_OFFSET = 2000 // large enough to separate pages vertically

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const yOffset = (p - 1) * PAGE_Y_OFFSET

    for (const item of content.items) {
      // pdfjs text items have a transform array [a,b,c,d,e,f]; e=x, f=y
      const ti = item as { str: string; transform: number[] }
      const str = ti.str.trim()
      if (!str) continue
      const x = ti.transform[4]
      // Invert y so rows go top-to-bottom; add page offset
      const y = yOffset + (page.view[3] - ti.transform[5])
      allItems.push({ str, x, y })
    }
  }

  return allItems
}

interface Row {
  y: number
  items: TextItem[]
}

function groupIntoRows(items: TextItem[], yTolerance = 4): Row[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const rows: Row[] = []
  let current: Row = { y: sorted[0].y, items: [sorted[0]] }

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    if (Math.abs(item.y - current.y) <= yTolerance) {
      current.items.push(item)
    } else {
      rows.push(current)
      current = { y: item.y, items: [item] }
    }
  }
  rows.push(current)

  // Sort each row's items left-to-right
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x)
  }
  return rows
}

function normalizeStr(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// Merge adjacent PDF text fragments that belong to the same logical item
// (e.g. "Videoconference" + "Attendant" emitted as separate runs).
// 6pt/char estimate; threshold kept tight so cross-column names don't merge.
function mergeCloseFragments(row: Row): Row {
  const merged: TextItem[] = []
  for (const item of row.items) {
    const last = merged[merged.length - 1]
    if (last && item.x - (last.x + last.str.length * 6) < 4) {
      last.str = last.str + ' ' + item.str
    } else {
      merged.push({ ...item })
    }
  }
  return { ...row, items: merged }
}

export async function parseDeckhandPDF(
  arrayBuffer: ArrayBuffer,
): Promise<Map<string, DeckhandAssignments>> {
  const rawItems = await extractTextItems(arrayBuffer)
  const rawRows = groupIntoRows(rawItems)
  const rows = rawRows.map(r => mergeCloseFragments(r))

  // ---- Phase 1: identify date-header rows ----
  // A date-header row has at least one non-leftmost item starting with a DOW word
  type DateColumn = { x: number; date: string }
  type Block = { rowIndex: number; columns: DateColumn[] }
  const blocks: Block[] = []

  const MONTH_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    if (row.items.length === 0) continue
    const dateItems = row.items.filter(item => DOW_RE.test(normalizeStr(item.str)))
    if (dateItems.length === 0) continue

    const nextRow = ri + 1 < rows.length ? rows[ri + 1] : null
    let usedNextRow = false

    const columns: DateColumn[] = []
    for (const item of dateItems) {
      const itemStr = normalizeStr(item.str)
      // Case 1: item itself contains "Wednesday May 6"
      let date = parseDeckhandDateStr(itemStr)

      if (!date) {
        // Case 2: month+day is a sibling item in the same row at a nearby x
        const sameRowMonth = row.items.find(
          it => it !== item && Math.abs(it.x - item.x) < 60 && MONTH_RE.test(normalizeStr(it.str))
        )
        if (sameRowMonth) date = parseDeckhandDateStr(`${itemStr} ${normalizeStr(sameRowMonth.str)}`)
      }

      if (!date && nextRow) {
        // Case 3: DOW on this row, "May 6" on the next row at the same x column
        const nextRowMonth = nextRow.items.find(
          it => Math.abs(it.x - item.x) < 60 && MONTH_RE.test(normalizeStr(it.str))
        )
        if (nextRowMonth) {
          date = parseDeckhandDateStr(`${itemStr} ${normalizeStr(nextRowMonth.str)}`)
          if (date) usedNextRow = true
        }
      }

      if (date) columns.push({ x: item.x, date })
    }

    if (columns.length > 0) {
      // If month row was on the next line, start Phase 2 scanning after it
      blocks.push({ rowIndex: usedNextRow ? ri + 1 : ri, columns })
    }
  }

  if (blocks.length === 0) return new Map()

  // ---- Phase 2: for each block, extract role rows ----
  const result = new Map<string, DeckhandAssignments>()

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]
    const nextBlockStart = bi + 1 < blocks.length ? blocks[bi + 1].rowIndex : rows.length

    // Collect role label column x-range: leftmost x in the block header row
    const leftmostX = Math.min(...block.columns.map(c => c.x))

    // Assign each date's x to the result map
    const colEntries = block.columns.slice().sort((a, b) => a.x - b.x)

    const findNearestColumn = (x: number): DateColumn | undefined => {
      let best: DateColumn | undefined
      let bestDist = Infinity
      for (const col of colEntries) {
        const dist = Math.abs(x - col.x)
        if (dist < bestDist) { bestDist = dist; best = col }
      }
      // Allow up to 80pt offset — names can be slightly misaligned
      return bestDist < 80 ? best : undefined
    }

    // Ensure each date has an entry
    for (const col of colEntries) {
      if (!result.has(col.date)) result.set(col.date, {})
    }

    // Scan rows inside this block
    let pendingTwoPersonRole: string[] | null = null

    for (let ri = block.rowIndex + 1; ri < nextBlockStart; ri++) {
      const rawRow = rawRows[ri]
      if (rawRow.items.length === 0) continue

      // Use raw row for everything — avoids merging role label with adjacent name columns.
      // Items left of the date columns are role label fragments; items at/right are names.
      const roleLabelItems = rawRow.items.filter(it => it.x < leftmostX - 5)
      const nameItems      = rawRow.items.filter(it => it.x >= leftmostX - 5)

      if (roleLabelItems.length > 0) {
        // Progressively combine leftmost items until we match a known role label
        // (handles multi-word labels like "Videoconference Attendant" split across items)
        let matchedLabel = ''
        let matchedKeys: string[] | undefined
        for (let n = 1; n <= Math.min(3, roleLabelItems.length); n++) {
          const candidate = roleLabelItems.slice(0, n).map(it => normalizeStr(it.str)).join(' ')
          const k = lookupRole(candidate)
          if (k) { matchedLabel = candidate; matchedKeys = k; break }
        }

        if (matchedKeys && TWO_PERSON_ROLES.has(matchedLabel.toLowerCase())) {
          // Collect up to 2 name items per date column (some PDFs put both on the same row)
          const colBuckets = new Map<string, string[]>()
          for (const nameItem of nameItems) {
            const col = findNearestColumn(nameItem.x)
            if (!col) continue
            const name = normalizeStr(nameItem.str)
            if (SKIP_VALUES.has(name.toLowerCase())) continue
            const bucket = colBuckets.get(col.date) ?? []
            if (bucket.length < 2) { bucket.push(name); colBuckets.set(col.date, bucket) }
          }

          for (const [date, names] of colBuckets) {
            const entry = result.get(date) ?? {}
            for (let i = 0; i < names.length && i < matchedKeys.length; i++) {
              const field = matchedKeys[i] as keyof DeckhandAssignments
              if (USED_FIELDS.has(field) && !entry[field]) entry[field] = names[i]
            }
            result.set(date, entry)
          }
          // Keep pendingTwoPersonRole in case the PDF puts the 2nd person on the next row
          pendingTwoPersonRole = matchedKeys
        } else if (matchedKeys) {
          pendingTwoPersonRole = null
          for (const nameItem of nameItems) {
            const col = findNearestColumn(nameItem.x)
            if (!col) continue
            const name = normalizeStr(nameItem.str)
            if (SKIP_VALUES.has(name.toLowerCase())) continue
            const entry = result.get(col.date) ?? {}
            const field = matchedKeys[0] as keyof DeckhandAssignments
            if (USED_FIELDS.has(field) && !entry[field]) entry[field] = name
            result.set(col.date, entry)
          }
        } else {
          pendingTwoPersonRole = null
        }
      } else if (pendingTwoPersonRole && nameItems.length > 0) {
        // Continuation row — second person of two-person role
        const keys = pendingTwoPersonRole
        for (const nameItem of nameItems) {
          const col = findNearestColumn(nameItem.x)
          if (!col) continue
          const name = normalizeStr(nameItem.str)
          if (SKIP_VALUES.has(name.toLowerCase())) continue
          const entry = result.get(col.date) ?? {}
          const field = keys[1] as keyof DeckhandAssignments
          if (USED_FIELDS.has(field) && !entry[field]) entry[field] = name
          result.set(col.date, entry)
        }
        pendingTwoPersonRole = null
      }
    }
  }

  // Convert raw name strings to undefined (they'll be resolved to IDs later)
  // Actually, return the map as-is; the caller resolves names to IDs
  return result
}
