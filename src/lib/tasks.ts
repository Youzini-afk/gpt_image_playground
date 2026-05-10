import type { TaskRecord, TaskStatus } from '../types'

export function getFilteredTasks(
  tasks: TaskRecord[],
  searchQuery: string,
  filterStatus: TaskStatus | 'all',
  filterFavorite: boolean,
): TaskRecord[] {
  const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
  const q = searchQuery.trim().toLowerCase()

  return sorted.filter((t) => {
    if (filterFavorite && !t.isFavorite) return false
    const matchStatus = filterStatus === 'all' || t.status === filterStatus
    if (!matchStatus) return false

    if (!q) return true
    const prompt = (t.prompt || '').toLowerCase()
    const paramStr = JSON.stringify(t.params).toLowerCase()
    return prompt.includes(q) || paramStr.includes(q)
  })
}
