import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export class FileStorage {
  private tasksFile: string
  private imagesDir: string
  private canvasDir: string

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    this.tasksFile = join(dataDir, 'tasks.json')
    this.imagesDir = join(dataDir, 'images')
    this.canvasDir = join(dataDir, 'canvas')
    if (!existsSync(this.imagesDir)) mkdirSync(this.imagesDir, { recursive: true })
    if (!existsSync(this.canvasDir)) mkdirSync(this.canvasDir, { recursive: true })
    if (!existsSync(this.tasksFile)) writeFileSync(this.tasksFile, '[]', 'utf-8')
  }

  getAllTasks<TaskRecord>(): TaskRecord[] {
    return JSON.parse(readFileSync(this.tasksFile, 'utf-8'))
  }

  putTask<TaskRecord extends { id: string }>(task: TaskRecord): void {
    const tasks = this.getAllTasks<TaskRecord>()
    const index = tasks.findIndex((t: TaskRecord) => t.id === task.id)
    if (index >= 0) {
      tasks[index] = task
    } else {
      tasks.unshift(task)
    }
    writeFileSync(this.tasksFile, JSON.stringify(tasks), 'utf-8')
  }

  deleteTask(id: string): void {
    const tasks = this.getAllTasks().filter((t: { id: string }) => t.id !== id)
    writeFileSync(this.tasksFile, JSON.stringify(tasks), 'utf-8')
  }

  clearTasks(): void {
    writeFileSync(this.tasksFile, '[]', 'utf-8')
  }

  getAllImages<Image>(): Image[] {
    const files = readdirSync(this.imagesDir).filter(f => f.endsWith('.json'))
    return files.map(f => JSON.parse(readFileSync(join(this.imagesDir, f), 'utf-8')))
  }

  getImage<Image>(id: string): Image | undefined {
    const file = join(this.imagesDir, `${id}.json`)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, 'utf-8'))
  }

  putImage<Image extends { id: string }>(image: Image): void {
    const file = join(this.imagesDir, `${image.id}.json`)
    writeFileSync(file, JSON.stringify(image), 'utf-8')
  }

  deleteImage(id: string): void {
    const file = join(this.imagesDir, `${id}.json`)
    if (existsSync(file)) unlinkSync(file)
  }

  clearImages(): void {
    const files = readdirSync(this.imagesDir).filter(f => f.endsWith('.json'))
    for (const f of files) unlinkSync(join(this.imagesDir, f))
  }

  // ===== Canvas Images =====

  getAllCanvasImages<Item>(): Item[] {
    const files = readdirSync(this.canvasDir).filter(f => f.endsWith('.json'))
    return files.map(f => JSON.parse(readFileSync(join(this.canvasDir, f), 'utf-8')))
  }

  putCanvasImage<Item extends { id: string }>(item: Item): void {
    const file = join(this.canvasDir, `${item.id}.json`)
    writeFileSync(file, JSON.stringify(item), 'utf-8')
  }

  deleteCanvasImage(id: string): void {
    const file = join(this.canvasDir, `${id}.json`)
    if (existsSync(file)) unlinkSync(file)
  }

  clearCanvasImages(): void {
    const files = readdirSync(this.canvasDir).filter(f => f.endsWith('.json'))
    for (const f of files) unlinkSync(join(this.canvasDir, f))
  }
}