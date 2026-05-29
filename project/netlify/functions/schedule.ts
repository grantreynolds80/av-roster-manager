import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TABLE = 'schedule'
const ROW_ID = 'v1'

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from(TABLE)
        .select('data')
        .eq('id', ROW_ID)
        .maybeSingle()

      if (error) throw error
      return Response.json(data?.data ?? null)
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { error } = await supabase
        .from(TABLE)
        .upsert({ id: ROW_ID, data: body, updated_at: new Date().toISOString() })

      if (error) throw error
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (err) {
    console.error('[schedule]', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
