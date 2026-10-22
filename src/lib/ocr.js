// Citirea bonului direct pe telefon (Tesseract.js, încărcat doar când e nevoie)
import { extractReceipt } from './receipt.js'

let workerPromise = null
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      // „ron” pentru diacritice, „rus” pentru bonurile în rusă
      return createWorker(['ron', 'rus'], 1, { logger: () => {} })
    })().catch((e) => { workerPromise = null; throw e })
  }
  return workerPromise
}

// Micșorează și transformă în alb-negru pentru o citire mai bună și mai rapidă
async function prepare(file) {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    const g = c.getContext('2d')
    g.filter = 'grayscale(1) contrast(1.4)'
    g.drawImage(bmp, 0, 0, c.width, c.height)
    return c
  } catch (_) { return file }
}

export async function readReceipt(file) {
  const worker = await getWorker()
  const { data } = await worker.recognize(await prepare(file))
  return extractReceipt(data?.text || '')
}
