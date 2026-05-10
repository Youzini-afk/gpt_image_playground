import { describe, expect, it } from 'vitest'
import { getFilteredTasks } from './tasks'
import type { TaskRecord } from '../types'

function makeTask(overrides: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    id: overrides.id,
    prompt: overrides.prompt ?? '',
    params: overrides.params ?? {
      size: '1024x1024',
      quality: 'auto',
      output_format: 'png',
      output_compression: null,
      moderation: 'auto',
      n: 1,
    },
    status: overrides.status ?? 'done',
    isFavorite: overrides.isFavorite ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
    inputImageIds: [],
    outputImages: [],
    error: null,
    finishedAt: null,
    elapsed: null,
  }
}

describe('getFilteredTasks', () => {
  it('filters by status', () => {
    const tasks = [
      makeTask({ id: '1', status: 'running' }),
      makeTask({ id: '2', status: 'done' }),
      makeTask({ id: '3', status: 'error' }),
    ]

    expect(getFilteredTasks(tasks, '', 'running', false).map((t) => t.id)).toEqual(['1'])
    expect(getFilteredTasks(tasks, '', 'done', false).map((t) => t.id)).toEqual(['2'])
    expect(getFilteredTasks(tasks, '', 'error', false).map((t) => t.id)).toEqual(['3'])
  })

  it('returns all statuses when filterStatus is all', () => {
    const tasks = [
      makeTask({ id: '1', status: 'running', createdAt: 300 }),
      makeTask({ id: '2', status: 'done', createdAt: 200 }),
      makeTask({ id: '3', status: 'error', createdAt: 100 }),
    ]

    expect(getFilteredTasks(tasks, '', 'all', false).map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('filters by favorite', () => {
    const tasks = [
      makeTask({ id: '1', isFavorite: true, createdAt: 300 }),
      makeTask({ id: '2', isFavorite: false, createdAt: 200 }),
      makeTask({ id: '3', isFavorite: true, createdAt: 100 }),
    ]

    expect(getFilteredTasks(tasks, '', 'all', true).map((t) => t.id)).toEqual(['1', '3'])
  })

  it('combines favorite and status filters', () => {
    const tasks = [
      makeTask({ id: '1', status: 'done', isFavorite: true }),
      makeTask({ id: '2', status: 'running', isFavorite: true }),
      makeTask({ id: '3', status: 'done', isFavorite: false }),
    ]

    expect(getFilteredTasks(tasks, '', 'done', true).map((t) => t.id)).toEqual(['1'])
  })

  it('searches prompt case-insensitively', () => {
    const tasks = [
      makeTask({ id: '1', prompt: 'Hello World', createdAt: 300 }),
      makeTask({ id: '2', prompt: 'goodbye moon', createdAt: 200 }),
      makeTask({ id: '3', prompt: 'hello universe', createdAt: 100 }),
    ]

    expect(getFilteredTasks(tasks, 'hello', 'all', false).map((t) => t.id)).toEqual(['1', '3'])
    expect(getFilteredTasks(tasks, 'HELLO', 'all', false).map((t) => t.id)).toEqual(['1', '3'])
    expect(getFilteredTasks(tasks, '  hello  ', 'all', false).map((t) => t.id)).toEqual(['1', '3'])
  })

  it('searches params JSON case-insensitively', () => {
    const tasks = [
      makeTask({ id: '1', params: { size: '1024x1024', quality: 'auto', output_format: 'png', output_compression: null, moderation: 'auto', n: 1 } }),
      makeTask({ id: '2', params: { size: '512x512', quality: 'high', output_format: 'jpeg', output_compression: null, moderation: 'auto', n: 1 } }),
    ]

    expect(getFilteredTasks(tasks, '1024', 'all', false).map((t) => t.id)).toEqual(['1'])
    expect(getFilteredTasks(tasks, 'jpeg', 'all', false).map((t) => t.id)).toEqual(['2'])
    expect(getFilteredTasks(tasks, 'HIGH', 'all', false).map((t) => t.id)).toEqual(['2'])
  })

  it('sorts descending by createdAt', () => {
    const tasks = [
      makeTask({ id: '1', createdAt: 100 }),
      makeTask({ id: '2', createdAt: 300 }),
      makeTask({ id: '3', createdAt: 200 }),
    ]

    expect(getFilteredTasks(tasks, '', 'all', false).map((t) => t.id)).toEqual(['2', '3', '1'])
  })

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask({ id: '1', createdAt: 100 }),
      makeTask({ id: '2', createdAt: 300 }),
    ]
    const originalOrder = tasks.map((t) => t.id)

    getFilteredTasks(tasks, '', 'all', false)

    expect(tasks.map((t) => t.id)).toEqual(originalOrder)
  })

  it('returns empty array when nothing matches', () => {
    const tasks = [makeTask({ id: '1', prompt: 'cat' })]

    expect(getFilteredTasks(tasks, 'dog', 'all', false)).toEqual([])
    expect(getFilteredTasks(tasks, '', 'error', false)).toEqual([])
    expect(getFilteredTasks(tasks, '', 'all', true)).toEqual([])
  })

  it('returns all tasks when no filters or search are applied', () => {
    const tasks = [
      makeTask({ id: '1', createdAt: 100 }),
      makeTask({ id: '2', createdAt: 200 }),
    ]

    expect(getFilteredTasks(tasks, '', 'all', false).map((t) => t.id)).toEqual(['2', '1'])
  })
})
