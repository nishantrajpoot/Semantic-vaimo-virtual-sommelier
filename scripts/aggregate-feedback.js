#!/usr/bin/env node
/**
 * Aggregate feedback.json into feedback_aggregated.json
 * Generates an array of { wineId, likes, dislikes }
 */
const fs = require('fs')
const path = require('path')

function main() {
  const dataDir = path.join(__dirname, '..', 'data')
  const inputFile = path.join(dataDir, 'feedback.json')
  const outputFile = path.join(dataDir, 'feedback_aggregated.json')
  let feedback = []
  try {
    feedback = JSON.parse(fs.readFileSync(inputFile, 'utf-8'))
  } catch (err) {
    console.error('No feedback data found or invalid JSON.', err)
    process.exit(1)
  }
  const counts = {}
  feedback.forEach(record => {
    const { wineId, feedback: fb } = record
    if (!counts[wineId]) counts[wineId] = { likes: 0, dislikes: 0 }
    if (fb === 'like') counts[wineId].likes++
    else if (fb === 'dislike') counts[wineId].dislikes++
  })
  const output = Object.entries(counts).map(([wineId, { likes, dislikes }]) => ({ wineId, likes, dislikes }))
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2))
  console.log(`Aggregated ${output.length} wine feedback records.`)
}

if (require.main === module) {
  main()
}
