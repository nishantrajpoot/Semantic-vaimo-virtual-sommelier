#!/usr/bin/env node
/**
 * Aggregate feedback.json into feedback_aggregated.json
 * Generates an array of { wineId, likes, dislikes }
 */
const fs = require('fs')
// Load environment variables from .env.local if present
const path = require('path')
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8')
    .split(/\r?\n/)
    .forEach(line => {
      if (!line.startsWith('#') && line.includes('=')) {
        const [key, ...vals] = line.split('=')
        const value = vals.join('=').trim()
        if (!(key in process.env)) process.env[key] = value
      }
    })
}
// Database aggregation using Neon
// Database aggregation using Neon
const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.NEON_DATABASE_URL)

async function main() {
  // Check required environment
  if (!process.env.NEON_DATABASE_URL) {
    console.error('Missing NEON_DATABASE_URL environment variable')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY environment variable')
    process.exit(1)
  }
  try {
    // 1) Upsert aggregated counts
    await sql`
      INSERT INTO feedback_aggregated (wine_id, total_likes, total_dislikes, updated_at)
      SELECT
        wine_id,
        COUNT(*) FILTER (WHERE positive <> '') AS total_likes,
        COUNT(*) FILTER (WHERE negative <> '') AS total_dislikes,
        NOW() AS updated_at
      FROM feedback_all
      GROUP BY wine_id
      ON CONFLICT (wine_id) DO UPDATE
        SET total_likes    = EXCLUDED.total_likes,
            total_dislikes = EXCLUDED.total_dislikes,
            updated_at     = EXCLUDED.updated_at;
    `
    console.log('Aggregated counts updated.')
    // 2) Generate summaries per wine
    const wines = await sql`SELECT wine_id AS "wineId" FROM feedback_aggregated`
    for (const { wineId } of wines) {
      // Fetch feedback samples
      const posRows = await sql`
        SELECT positive FROM feedback_all
        WHERE wine_id = ${wineId}::text AND positive <> ''
      `
      const negRows = await sql`
        SELECT negative FROM feedback_all
        WHERE wine_id = ${wineId}::text AND negative <> ''
      `
      const positives = posRows.map(r => r.positive)
      const negatives = negRows.map(r => r.negative)
      // Summarization helper
      async function summarize(items, label) {
        if (items.length === 0) return ''
        const instruction = label === 'positive'
          ? 'Summarize the following positive feedback by describing the questions users asked.'
          : 'Summarize the following negative feedback by describing the questions users asked.'
        const prompt = `${instruction}\n\nFeedback samples:\n- ${items.join('\n- ')}`
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 100 }),
        })
        if (!res.ok) {
          console.error(`OpenAI summarize error for ${wineId} ${label}:`, await res.text())
          return ''
        }
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || ''
      }
      const positive_summary = await summarize(positives, 'positive')
      const negative_summary = await summarize(negatives, 'negative')
      // Update summaries
      await sql`
        UPDATE feedback_aggregated
        SET positive_summary = ${positive_summary},
            negative_summary = ${negative_summary},
            updated_at = NOW()
        WHERE wine_id = ${wineId}::text
      `
      console.log(`Updated summaries for wine ${wineId}`)
    }
    console.log('All summaries updated.')
    process.exit(0)
  } catch (err) {
    console.error('Error in aggregate-feedback script:', err)
    process.exit(1)
  }
}
if (require.main === module) main()
