import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { randomUUID } from 'crypto'

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
    // Required fields for counts: userId, wineId/sku, and feedback type
    const userId = data.userId
    const wineId = data.sku ?? data.wineId
    const feedbackType = data.feedback
    if (!userId || !wineId || !feedbackType) {
      return NextResponse.json({ error: 'Missing required fields: userId, wineId, or feedback' }, { status: 400 })
    }
    if (feedbackType !== 'like' && feedbackType !== 'dislike') {
      return NextResponse.json({ error: 'Invalid feedback value' }, { status: 400 })
    }
    // Generate unique session ID
    const queryId = randomUUID()
    // 1) insert into feedback counts table
    await sql`
      INSERT INTO feedback (user_id, wine_id, feedback, timestamp)
      VALUES (${userId}, ${wineId}::text, ${feedbackType}, NOW())
    `
    // 2) optionally record the user’s question summary (context) and language in feedback_all
    const summary = data.context ?? data.question ?? data.q ?? ''
    if (summary) {
      const positive = feedbackType === 'like' ? summary : ''
      const negative = feedbackType === 'dislike' ? summary : ''
      // Capture language, default to 'en' if not provided
      const lang = data.language ?? 'en'
      await sql`
        INSERT INTO feedback_all (query_id, wine_id, positive, negative, timestamp, language)
        VALUES (${queryId}, ${wineId}::text, ${positive}, ${negative}, NOW(), ${lang})
      `
    }
    return NextResponse.json({ ok: true, queryId })
  } catch (err) {
    console.error('Feedback POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
