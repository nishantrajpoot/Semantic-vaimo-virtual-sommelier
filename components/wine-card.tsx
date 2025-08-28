"use client"

import { useState } from "react"
import type { Wine, Language } from "@/types/wine"
import { getTranslation } from "@/utils/translations"
import { ExternalLink, Euro, ThumbsUp, ThumbsDown } from "lucide-react"
import { WinePopup } from "./wine-popup"
import { sendFeedback, FeedbackType } from '@/utils/feedbackClient'

interface WineCardProps {
  // Wine may include optional ranking scores when used for recommendations
  wine: Wine & { similarity?: number; feedbackScore?: number; finalScore?: number }
  language: Language
}

export function WineCard({ wine, language }: WineCardProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackType | null>(null)

  // Remove this entire function
  // const handleDirectLink = (e: React.MouseEvent) => {
  //   e.stopPropagation()
  //   if (wine.link) {
  //     window.open(wine.link, "_blank", "noopener,noreferrer")
  //   }
  // }

  // Extract optional ranking score
  const finalScore = wine.finalScore
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex gap-3">
      <img
        src={wine.image_URL || "/placeholder.svg?height=80&width=64"}
        alt={wine.Product_name}
        className="w-16 h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsPopupOpen(true)}
      />
          <div className="flex-1 min-w-0">
          <h4
              className="font-medium text-sm text-gray-900 line-clamp-2 mb-2 cursor-pointer hover:text-red-600 transition-colors"
              onClick={() => setIsPopupOpen(true)}
            >
              {wine.Product_name}
            </h4>

            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Euro className="w-3 h-3" />
                <span className="font-semibold text-green-600">{wine.Price}</span>
              </div>

              {wine.Volume && (
                <div>
                  {getTranslation(language, "volume")}: {wine.Volume}
                </div>
              )}

              {wine.promotion && wine.promotion !== "null" && wine.promotion !== "" && wine.promotion !== "0" && (
                <div className="text-red-600 font-medium text-xs">{wine.promotion}</div>
              )}
              {finalScore != null && (
                <div className="text-xs text-gray-500">
                  Score: {finalScore.toFixed(2)}
                </div>
              )}
            </div>

            <div className="mt-2">
              <button
                onClick={() => setIsPopupOpen(true)}
                className="inline-flex items-center gap-1 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Details
              </button>
              {/* Feedback buttons below Details */}
              <div className="flex gap-2 mt-1">
                <button
                  disabled={!!feedback}
                  onClick={async () => {
                    setFeedback('like')
                    await sendFeedback(wine.id, 'like')
                  }}
                  aria-label="Like"
                  className="inline-flex items-center justify-center bg-green-100 text-green-800 p-2 rounded hover:bg-green-200 disabled:opacity-50"
                >
                  <ThumbsUp className="w-5 h-5 text-yellow-400" />
                </button>
                <button
                  disabled={!!feedback}
                  onClick={async () => {
                    setFeedback('dislike')
                    await sendFeedback(wine.id, 'dislike')
                  }}
                  aria-label="Dislike"
                  className="inline-flex items-center justify-center bg-gray-100 text-gray-800 p-2 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  <ThumbsDown className="w-5 h-5 text-yellow-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WinePopup wine={wine} language={language} isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
    </>
  )
}
