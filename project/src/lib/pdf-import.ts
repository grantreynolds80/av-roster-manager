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

// Roles that map to two consecutive people (first mic, second mic)
const TWO_PERSON_ROLES = new Set(['Microphones', 'Welcoming'])

// Map role-label text → assignment key(s)
// Returns one key or two keys (for two-person rows)
const ROLE_MAP: Record<string, string[]> = {
  Chairman:                   ['chairman'],
  Reader:                     ['reader'],
  'Entrance Attendant':       ['entranceAttendant'],
  'Auditorium Attendant':     ['auditoriumAttendant'],
  Welcoming:                  ['welcoming1', 'welcoming2'],
  Platform:                   ['platform'],
  Microphones:                ['mic1', 'mic2'],
  Security:                   ['security'],
  'Videoconference Attendant':['vc'],
  'Audio Operator':           ['audio'],
  'Video Operator':           ['video'],
  'Audio/Video Operator':     ['backup'],
  Hospitality:                ['hospitality'],
  'Watchtower Conductor':     ['watchtowerConductor'],
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

function parseDeckhandDateStr(raw: string): string | undefined {
  if (!raw) return undefined
  const firstLine = raw.split(/[\n\r]/)[0].trim()
  const withoutDow = firstLine.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*/i, '').trim()
  if (!withoutDow) return undefined
  const now = new Date()
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const attempt = new Date(`${withoutDow} ${year}`)
    if (!isNaN(attempt.getTime())) return attempt.toISOString().split('T')[0]
  }
  return undefined
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

// Merge short fragments that are likely split multi-word role labels or names
// PDF may emit "Videoconference" and "Attendant" as separate items in the same row
function mergeCloseFragments(row: Row, xGapThreshold = 6): Row {
  const merged: TextItem[] = []
  for (const item of row.items) {
    const last = merged[merged.length - 1]
    // Estimate character width ~ 6pt for average text
    if (last && item.x - (last.x + last.str.length * 5.5) < xGapThreshold) {
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

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    if (row.items.length < 2) continue
    // Check if any non-first item matches DOW
    const dateItems = row.items.filter((item, idx) => idx > 0 && DOW_RE.test(normalizeStr(item.str)))
    if (dateItems.length === 0) continue

    const columns: DateColumn[] = []
    for (const item of dateItems) {
      // The date might be split across the same row due to line-wrapping in PDF;
      // look for the next item in the same x-vicinity that has "June"/"July"/etc.
      const monthItems = row.items.filter(
        it => it !== item && Math.abs(it.x - item.x) < 30 && /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(normalizeStr(it.str))
      )
      const combined = monthItems.length > 0
        ? `${normalizeStr(item.str)} ${normalizeStr(monthItems[0].str)}`
        : normalizeStr(item.str)
      const date = parseDeckhandDateStr(combined)
      if (date) columns.push({ x: item.x, date })
    }
    if (columns.length > 0) blocks.push({ rowIndex: ri, columns })
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
      const row = rows[ri]
      if (row.items.length === 0) continue

      const mergedRow = row // already merged above

      // Classify items: leftmost is the role label (if x < leftmostX + some margin)
      // Others are names
      const roleItem = mergedRow.items.find(it => it.x < leftmostX - 5)
      const nameItems = mergedRow.items.filter(it => it.x >= leftmostX - 5)

      if (roleItem) {
        const roleLabel = normalizeStr(roleItem.str)
        const keys = ROLE_MAP[roleLabel]
        if (keys && TWO_PERSON_ROLES.has(roleLabel)) {
          // First row of a two-person role
          pendingTwoPersonRole = keys
          // Assign keys[0] from this row
          for (const nameItem of nameItems) {
            const col = findNearestColumn(nameItem.x)
            if (!col) continue
            const name = normalizeStr(nameItem.str)
            if (SKIP_VALUES.has(name.toLowerCase())) continue
            const entry = result.get(col.date) ?? {}
            const field = keys[0] as keyof DeckhandAssignments
            if (USED_FIELDS.has(field) && !entry[field]) entry[field] = name
            result.set(col.date, entry)
          }
        } else if (keys) {
          pendingTwoPersonRole = null
          for (const nameItem of nameItems) {
            const col = findNearestColumn(nameItem.x)
            if (!col) continue
            const name = normalizeStr(nameItem.str)
            if (SKIP_VALUES.has(name.toLowerCase())) continue
            const entry = result.get(col.date) ?? {}
            const field = keys[0] as keyof DeckhandAssignments
            if (USED_FIELDS.has(field) && !entry[field]) entry[field] = name
            result.set(col.date, entry)
          }
        } else {
          pendingTwoPersonRole = null
        }
      } else if (pendingTwoPersonRole && nameItems.length > 0) {
        // Continuation row (blank role label) — second person of two-person role
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
