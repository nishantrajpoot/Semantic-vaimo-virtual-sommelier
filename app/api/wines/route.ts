import { NextResponse } from 'next/server'
import data_EN from '@/data/data_EN.json'
import syntheticWines from '@/data/synthetic_wine_database_10000.json'
import data_NL from '@/data/data_NL.json'
import type { Wine, Language } from '@/types/wine'
// Aggregated feedback will be loaded at runtime from the database
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.NEON_DATABASE_URL!)

// In-memory vector index cache per language
type EmbeddingIndex = { wines: Wine[]; embeddings: number[][] }
const indexCache: Partial<Record<Language, EmbeddingIndex>> = {}
const initIndexPromise: Partial<Record<Language, Promise<EmbeddingIndex>>> = {}

// ---- Helper: Call OpenAI Embeddings API ----
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small', // or 'text-embedding-3-large'
        input: texts,
      }),
    })

    if (!res.ok) {
      console.error('Embedding API error:', await res.text())
      return texts.map(() => [])
    }

    const json = await res.json()
    return json.data.map((d: any) => d.embedding as number[])
  } catch (err) {
    console.error('Embedding fetch failed:', err)
    return texts.map(() => [])
  }
}

// ---- Helper: Cosine similarity ----
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ---- Initialize vector index (per language) ----
async function initIndex(lang: Language): Promise<EmbeddingIndex> {
  if (indexCache[lang]) return indexCache[lang]!
  if (!initIndexPromise[lang]) {
    initIndexPromise[lang] = (async () => {
      const dataMap: Record<Language, Wine[]> = {
        en: data_EN as Wine[],
        fr: syntheticWines as Wine[],
        nl: data_NL as Wine[],
      }
      const wines = dataMap[lang] || dataMap.fr

      // Build input strings for embeddings
      const docs = wines.map(wine =>
        `${wine.Product_name ?? ''}. ${wine.Wine_Description ?? ''}. ${wine.Wine_Varieties ?? ''}`
      )

      // Batch embeddings
      const embeddings = await getEmbeddings(docs)

      const idx: EmbeddingIndex = { wines, embeddings }
      indexCache[lang] = idx
      return idx
    })()
  }
  return initIndexPromise[lang]!
}

// ---- API handler ----
/**
 * GET /api/wines?lang={en|fr|nl}&q={search term}
 * If q is provided and OPENAI_API_KEY is set → semantic search
 * Otherwise → keyword fallback
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const lang = (url.searchParams.get('lang') || 'fr') as Language

  // Load wines for requested language
  let wines: Wine[] = []
  switch (lang) {
    case 'en':
      wines = data_EN as Wine[]
      break
    case 'nl':
      wines = data_NL as Wine[]
      break
    case 'fr':
    default:
      wines = syntheticWines as Wine[]
      break
  }

  // Check for query param
  const qParam = url.searchParams.get('q')
  if (qParam) {
    const query = qParam.trim()

    if (process.env.OPENAI_API_KEY) {
      // Semantic search
      const { wines: idxWines, embeddings } = await initIndex(lang)
      const [qEmbed] = await getEmbeddings([query])

      const scored = idxWines.map((wine, i) => ({
        wine,
        score: qEmbed.length ? cosineSim(qEmbed, embeddings[i]) : 0,
      }))

      // Sort by similarity
      scored.sort((a, b) => b.score - a.score)

      // First-stage: take top 50 by similarity
      const top50 = scored.slice(0, 50)
      // Load aggregated feedback from database and build map
      const fbRows = await sql`
        SELECT wine_id AS "wineId",
               COUNT(*) FILTER (WHERE feedback = 'like') AS likes,
               COUNT(*) FILTER (WHERE feedback = 'dislike') AS dislikes
        FROM feedback
        GROUP BY wine_id
      `
      const fbMap = new Map<string, { likes: number; dislikes: number }>()
      let maxDiff = 0
      fbRows.forEach(f => {
        const likes = Number(f.likes)
        const dislikes = Number(f.dislikes)
        fbMap.set(f.wineId, { likes, dislikes })
        const diff = Math.abs(likes - dislikes)
        if (diff > maxDiff) maxDiff = diff
      })
      // Rerank with feedback signals: finalScore = alpha*sim + beta*normFb
      const alpha = parseFloat(process.env.RE_RANK_ALPHA || '0.8')
      const beta = parseFloat(process.env.RE_RANK_BETA || '0.2')
      const reranked = top50.map(item => {
        const fb = fbMap.get(item.wine.id) || { likes: 0, dislikes: 0 }
        const fbScore = fb.likes - fb.dislikes
        const normFb = maxDiff > 0 ? fbScore / maxDiff : 0
        return {
          wine: item.wine,
          similarity: item.score,
          feedbackScore: fbScore,
          finalScore: alpha * item.score + beta * normFb,
        }
      })
      reranked.sort((a, b) => b.finalScore - a.finalScore)
      // Return top 15 after reranking
      wines = reranked.slice(0, 15).map(item => ({
        ...item.wine,
        similarity: item.similarity,
        feedbackScore: item.feedbackScore,
        finalScore: item.finalScore,
      }))
    } else {
      // Keyword fallback
      const ql = query.toLowerCase()
      wines = wines.filter(wine => {
        const name = wine.Product_name?.toLowerCase() || ''
        const desc = wine.Wine_Description?.toLowerCase() || ''
        const varieties = (wine.Wine_Varieties || '').toLowerCase()
        return name.includes(ql) || desc.includes(ql) || varieties.includes(ql)
      })
    }
  }

  return NextResponse.json(wines)
}
