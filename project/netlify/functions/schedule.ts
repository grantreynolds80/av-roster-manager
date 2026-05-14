import { neon } from '@netlify/neon'

const dbUrl = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL
if (!dbUrl) throw new Error('No database URL found. Set NETLIFY_DATABASE_URL in site environment variables.')
const sql = neon(dbUrl)

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schedule (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export default async (req: Request): Promise<Response> => {
  try {
    await ensureTable()

    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM schedule WHERE id = 'v1'`
      return Response.json(rows.length > 0 ? rows[0].data : null)
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const data = JSON.stringify(body)
      await sql`
        INSERT INTO schedule (id, data, updated_at)
        VALUES ('v1', ${data}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
          SET data = ${data}::jsonb, updated_at = NOW()
      `
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (err) {
    console.error('[schedule]', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
