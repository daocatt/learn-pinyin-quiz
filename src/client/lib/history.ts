export interface StoredRoundHistory {
  id: number
  date: string
  score: number
  total: number
  percentage: number
  wrongCount: number
}

const STORAGE_KEY = 'pinyin_quiz_history_v1'
const MAX_LOCAL_RECORDS = 50

export function getLocalHistory(): StoredRoundHistory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRoundResult(record: {
  id: number
  score: number
  total: number
}): StoredRoundHistory {
  const percentage = Math.round((record.score / (record.total || 1)) * 100)
  const historyItem: StoredRoundHistory = {
    id: record.id,
    date: new Date().toISOString(),
    score: record.score,
    total: record.total,
    percentage,
    wrongCount: record.total - record.score,
  }

  try {
    const history = getLocalHistory()
    // Prepend new record, deduplicate by id
    const filtered = history.filter((h) => h.id !== record.id)
    const updated = [historyItem, ...filtered].slice(0, MAX_LOCAL_RECORDS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage quota errors
  }

  return historyItem
}

/**
 * Generate X (Twitter) intent sharing URL
 */
export function buildXShareUrl(record: {
  score: number
  total: number
  percentage: number
}): string {
  const emoji =
    record.percentage === 100
      ? '🏆 完美通关！'
      : record.percentage >= 80
        ? '🎉 战绩出色！'
        : record.percentage >= 60
          ? '💪 及格过关！'
          : '👀 舌头打结了！'

  const text = `${emoji}我在拼音听力测验中取得了 ${record.score}/${record.total} 分（正确率 ${record.percentage}%）！\n你能分清第一二三四声吗？来测测你的中文拼音听力：`
  const targetUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pinyin.app'

  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(targetUrl)}`
}
