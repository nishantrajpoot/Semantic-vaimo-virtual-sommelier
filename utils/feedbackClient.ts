// Client-side feedback utilities
// Generates or retrieves a per-user ID and sends feedback to the server
const USER_ID_KEY = 'feedbackUserId'

function getUserId(): string {
  if (typeof window === 'undefined') return 'unknown'
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    // Generate a simple UUID
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export type FeedbackType = 'like' | 'dislike'

export async function sendFeedback(
  wineId: string | number,
  feedback: FeedbackType
): Promise<void> {
  const payload = {
    userId: getUserId(),
    wineId,
    feedback,
    timestamp: new Date().toISOString(),
  }
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('Failed to send feedback', err)
  }
}
