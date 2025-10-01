import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

// POST /api/feedback/aggregate
// 1) upsert aggregated counts
// 2) generate AI summaries for positive & negative texts per wine_id
export async function POST(_: Request) {
  // Ensure OpenAI key
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }
  // 1) aggregate counts
  await sql`
    INSERT INTO feedback_aggregated (wine_id, total_likes, total_dislikes, updated_at)
    SELECT
      wine_id,
      COUNT(*) FILTER (WHERE positive <> '') AS total_likes,
      COUNT(*) FILTER (WHERE negative <> '') AS total_dislikes,
      NOW()
    FROM feedback_all
    GROUP BY wine_id
    ON CONFLICT (wine_id) DO UPDATE
      SET total_likes    = EXCLUDED.total_likes,
          total_dislikes = EXCLUDED.total_dislikes,
          updated_at     = EXCLUDED.updated_at;
  `
  // 2) generate summaries
  const wines = await sql`SELECT wine_id AS "wineId" FROM feedback_aggregated`
  for (const { wineId } of wines) {
    // collect texts
    const posRows = await sql`
      SELECT positive FROM feedback_all
      WHERE wine_id = ${wineId}::text AND positive <> ''
    `
    const negRows = await sql`
      SELECT negative FROM feedback_all
      WHERE wine_id = ${wineId}::text AND negative <> ''
    `
    const positives = posRows.map(r => r.positive as string)
    const negatives = negRows.map(r => r.negative as string)
    // helper to call OpenAI
    async function summarize(texts: string[], label: string) {
      if (texts.length === 0) return ''
      // Build an instruction that focuses on reasons for like/dislike
      const instruction = label === 'positive'
        ? 'Summarize the following positive feedback by describing what was the question asked by the user.'
        : 'Summarize the following negative feedback by describing what was the question asked by the user.'
      const prompt = `${instruction}\n\nFeedback samples:\n- ${texts.join('\n- ')}`
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 100,
        }),
      })
      if (!res.ok) {
        console.error('OpenAI error', await res.text())
        return ''
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content?.trim() ?? ''
    }
    const positive_summary = await summarize(positives, 'positive')
    const negative_summary = await summarize(negatives, 'negative')
    // update aggregated table
    await sql`
      UPDATE feedback_aggregated
      SET positive_summary = ${positive_summary},
          negative_summary = ${negative_summary},
          updated_at = NOW()
      WHERE wine_id = ${wineId}::text
    `
  }
  return NextResponse.json({ ok: true })
}
