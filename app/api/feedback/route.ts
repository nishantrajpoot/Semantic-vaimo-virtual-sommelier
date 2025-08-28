import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

interface FeedbackRecord {
  userId: string
  wineId: string | number
  feedback: 'like' | 'dislike'
  timestamp: string
}

// GET /api/feedback - return all feedback records
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'feedback.json')
    const content = await fs.readFile(filePath, 'utf-8')
    const arr = JSON.parse(content)
    return NextResponse.json(arr)
  } catch (err) {
    console.error('Feedback GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
// POST /api/feedback
export async function POST(request: Request) {
  try {
    const data: FeedbackRecord = await request.json()
    // Basic validation
    if (!data.userId || !data.wineId || !data.feedback) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const filePath = path.join(process.cwd(), 'data', 'feedback.json')
    // Read existing feedback
    let arr: FeedbackRecord[] = []
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      arr = JSON.parse(content) as FeedbackRecord[]
    } catch (e) {
      // ignore, assume new file
    }
    arr.push(data)
    // Write back
    await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
