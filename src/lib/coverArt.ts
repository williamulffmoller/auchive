import { readFile } from '@tauri-apps/plugin-fs'

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif',
}

export async function pathToBlobUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath)
  const ext = (filePath.split('.').pop() || 'jpg').toLowerCase()
  const blob = new Blob([bytes], { type: MIME[ext] || 'image/jpeg' })
  return URL.createObjectURL(blob)
}
