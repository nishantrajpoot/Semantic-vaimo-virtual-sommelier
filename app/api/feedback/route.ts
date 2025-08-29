import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

// GET /api/feedback           → returns raw feedback
// GET /api/feedback?type=agg  → returns aggregated feedback
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')

    if (type === 'agg') {
      // Aggregated feedback (computed with SQL)
      const rows = await sql`
        SELECT wine_id as "wineId",
               COUNT(*) FILTER (WHERE feedback = 'like') AS likes,
               COUNT(*) FILTER (WHERE feedback = 'dislike') AS dislikes
        FROM feedback
        GROUP BY wine_id
        ORDER BY wine_id
      `
      return NextResponse.json(rows)
    } else {
      // Raw feedback records
      const rows = await sql`
        SELECT user_id as "userId",
               wine_id as "wineId",
               feedback,
               timestamp
        FROM feedback
        ORDER BY timestamp DESC
      `
      return NextResponse.json(rows)
    }
  } catch (err) {
    console.error('Feedback GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/feedback → insert new record
export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.userId || !data.wineId || !data.feedback) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    await sql`
      INSERT INTO feedback (user_id, wine_id, feedback, timestamp)
      VALUES (${data.userId}, ${data.wineId}::text, ${data.feedback}, NOW())
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
