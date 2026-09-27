import type { QuizStorage } from './types.ts'
import { SqliteQuizStorage } from './sqlite.ts'
import { D1QuizStorage, type D1Database } from './d1.ts'

let defaultStorage: QuizStorage | null = null

export async function getStorage(d1?: D1Database): Promise<QuizStorage> {
  if (d1) {
    const storage = new D1QuizStorage(d1)
    await storage.init()
    return storage
  }

  if (!defaultStorage) {
    const storage = new SqliteQuizStorage()
    await storage.init()
    defaultStorage = storage
  }

  return defaultStorage
}
