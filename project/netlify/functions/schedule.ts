import { getStore } from '@netlify/blobs'

export default async (req: Request): Promise<Response> => {
  try {
    const store = getStore('schedule')

    if (req.method === 'GET') {
      const data = await store.get('v1', { type: 'json' })
      return Response.json(data ?? null)
    }

    if (req.method === 'POST') {
      const body = await req.json()
      await store.setJSON('v1', body)
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (err) {
    console.error('[schedule]', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
