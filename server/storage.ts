import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export class FileStorage {
  private db: Database.Database
  private dbFile: string
  private tasksFile: string
  private imagesDir: string
  private canvasDir: string

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    this.dbFile = join(dataDir, 'storage.db')
    this.tasksFile = join(dataDir, 'tasks.json')
    this.imagesDir = join(dataDir, 'images')
    this.canvasDir = join(dataDir, 'canvas')

    this.db = new Database(this.dbFile)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.initSchema()
    this.migrateLegacyJsonIfNeeded()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS image_thumbnails (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(id) REFERENCES images(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS canvas_images (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_conversations (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_image_thumbnails_created_at ON image_thumbnails(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_canvas_created_at ON canvas_images(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at ON agent_conversations(updated_at DESC);
    `)
  }

  private migrateLegacyJsonIfNeeded(): void {
    const hasTasks = this.count('tasks') > 0
    const hasImages = this.count('images') > 0
    const hasCanvas = this.count('canvas_images') > 0
    if (hasTasks || hasImages || hasCanvas) return

    if (!existsSync(this.imagesDir)) mkdirSync(this.imagesDir, { recursive: true })
    if (!existsSync(this.canvasDir)) mkdirSync(this.canvasDir, { recursive: true })

    const legacyTasks = this.readLegacyArray(this.tasksFile)
    const legacyImages = this.readLegacyDir(this.imagesDir)
    const legacyCanvas = this.readLegacyDir(this.canvasDir)
    if (legacyTasks.length === 0 && legacyImages.length === 0 && legacyCanvas.length === 0) return

    const migrate = this.db.transaction(() => {
      for (const task of legacyTasks) this.putTask(task as { id: string; createdAt?: number })
      for (const image of legacyImages) this.putImage(image as { id: string; createdAt?: number })
      for (const item of legacyCanvas) this.putCanvasImage(item as { id: string; createdAt?: number })
    })
    migrate()
  }

  private count(table: 'tasks' | 'images' | 'canvas_images'): number {
    const row = this.db.prepare(`SELECT COUNT(1) AS c FROM ${table}`).get() as { c: number }
    return row?.c ?? 0
  }

  private readLegacyArray(path: string): unknown[] {
    if (!existsSync(path)) return []
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private readLegacyDir(path: string): unknown[] {
    if (!existsSync(path)) return []
    const files = readdirSync(path).filter((f) => f.endsWith('.json'))
    const rows: unknown[] = []
    for (const file of files) {
      try {
        rows.push(JSON.parse(readFileSync(join(path, file), 'utf-8')))
      } catch {
        // ignore invalid legacy file
      }
    }
    return rows
  }

  getAllTasks<TaskRecord>(): TaskRecord[] {
    const rows = this.db
      .prepare('SELECT data_json FROM tasks ORDER BY created_at DESC, rowid DESC')
      .all() as Array<{ data_json: string }>
    return rows.map((row) => JSON.parse(row.data_json) as TaskRecord)
  }

  putTask<TaskRecord extends { id: string; createdAt?: number }>(task: TaskRecord): void {
    this.db
      .prepare(`
        INSERT INTO tasks (id, data_json, created_at)
        VALUES (@id, @data_json, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          data_json = excluded.data_json,
          created_at = excluded.created_at
      `)
      .run({
        id: task.id,
        data_json: JSON.stringify(task),
        created_at: task.createdAt ?? 0,
      })
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  clearTasks(): void {
    this.db.prepare('DELETE FROM tasks').run()
  }

  getAllImages<Image>(): Image[] {
    const rows = this.db
      .prepare('SELECT data_json FROM images ORDER BY created_at DESC, rowid DESC')
      .all() as Array<{ data_json: string }>
    return rows.map((row) => JSON.parse(row.data_json) as Image)
  }

  getAllImageMetadata<Image extends { dataUrl?: string }>(): Omit<Image, 'dataUrl'>[] {
    const rows = this.db
      .prepare('SELECT data_json FROM images ORDER BY created_at DESC, rowid DESC')
      .all() as Array<{ data_json: string }>
    return rows.map((row) => {
      const { dataUrl: _dataUrl, ...metadata } = JSON.parse(row.data_json) as Image
      return metadata
    })
  }

  getAllImageIds(): string[] {
    const rows = this.db
      .prepare('SELECT id FROM images ORDER BY created_at DESC, rowid DESC')
      .all() as Array<{ id: string }>
    return rows.map((row) => row.id)
  }

  getImage<Image>(id: string): Image | undefined {
    const row = this.db.prepare('SELECT data_json FROM images WHERE id = ?').get(id) as { data_json: string } | undefined
    return row ? (JSON.parse(row.data_json) as Image) : undefined
  }

  putImage<Image extends { id: string; createdAt?: number }>(image: Image): void {
    this.db
      .prepare(`
        INSERT INTO images (id, data_json, created_at)
        VALUES (@id, @data_json, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          data_json = excluded.data_json,
          created_at = excluded.created_at
      `)
      .run({
        id: image.id,
        data_json: JSON.stringify(image),
        created_at: image.createdAt ?? 0,
      })
  }

  deleteImage(id: string): void {
    const remove = this.db.transaction(() => {
      this.db.prepare('DELETE FROM image_thumbnails WHERE id = ?').run(id)
      this.db.prepare('DELETE FROM images WHERE id = ?').run(id)
    })
    remove()
    const legacyFile = join(this.imagesDir, `${id}.json`)
    if (existsSync(legacyFile)) unlinkSync(legacyFile)
  }

  clearImages(): void {
    const clear = this.db.transaction(() => {
      this.db.prepare('DELETE FROM image_thumbnails').run()
      this.db.prepare('DELETE FROM images').run()
    })
    clear()
    if (existsSync(this.imagesDir)) {
      const files = readdirSync(this.imagesDir).filter((f) => f.endsWith('.json'))
      for (const f of files) unlinkSync(join(this.imagesDir, f))
    }
  }

  getImageThumbnail<Thumbnail>(id: string): Thumbnail | undefined {
    const row = this.db.prepare('SELECT data_json FROM image_thumbnails WHERE id = ?').get(id) as { data_json: string } | undefined
    return row ? (JSON.parse(row.data_json) as Thumbnail) : undefined
  }

  putImageThumbnail<Thumbnail extends { id: string }>(thumbnail: Thumbnail): void {
    this.db
      .prepare(`
        INSERT INTO image_thumbnails (id, data_json, created_at)
        VALUES (@id, @data_json, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          data_json = excluded.data_json,
          created_at = excluded.created_at
      `)
      .run({
        id: thumbnail.id,
        data_json: JSON.stringify(thumbnail),
        created_at: Date.now(),
      })
  }

  deleteImageThumbnail(id: string): void {
    this.db.prepare('DELETE FROM image_thumbnails WHERE id = ?').run(id)
  }

  // ===== Canvas Images =====

  getAllCanvasImages<Item>(): Item[] {
    const rows = this.db
      .prepare('SELECT data_json FROM canvas_images ORDER BY created_at DESC, rowid DESC')
      .all() as Array<{ data_json: string }>
    return rows.map((row) => JSON.parse(row.data_json) as Item)
  }

  putCanvasImage<Item extends { id: string; createdAt?: number }>(item: Item): void {
    this.db
      .prepare(`
        INSERT INTO canvas_images (id, data_json, created_at)
        VALUES (@id, @data_json, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          data_json = excluded.data_json,
          created_at = excluded.created_at
      `)
      .run({
        id: item.id,
        data_json: JSON.stringify(item),
        created_at: item.createdAt ?? 0,
      })
  }

  deleteCanvasImage(id: string): void {
    this.db.prepare('DELETE FROM canvas_images WHERE id = ?').run(id)
    const legacyFile = join(this.canvasDir, `${id}.json`)
    if (existsSync(legacyFile)) unlinkSync(legacyFile)
  }

  clearCanvasImages(): void {
    this.db.prepare('DELETE FROM canvas_images').run()
    if (existsSync(this.canvasDir)) {
      const files = readdirSync(this.canvasDir).filter((f) => f.endsWith('.json'))
      for (const f of files) unlinkSync(join(this.canvasDir, f))
    }
  }

  // ===== Agent Conversations =====

  getAllAgentConversations<Conversation>(): Conversation[] {
    const rows = this.db
      .prepare('SELECT data_json FROM agent_conversations ORDER BY updated_at DESC, rowid DESC')
      .all() as Array<{ data_json: string }>
    return rows.map((row) => JSON.parse(row.data_json) as Conversation)
  }

  replaceAgentConversations<Conversation extends { id: string; updatedAt?: number }>(conversations: Conversation[]): void {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM agent_conversations').run()
      const insert = this.db.prepare(`
        INSERT INTO agent_conversations (id, data_json, updated_at)
        VALUES (@id, @data_json, @updated_at)
      `)
      for (const conversation of conversations) {
        insert.run({
          id: conversation.id,
          data_json: JSON.stringify(conversation),
          updated_at: conversation.updatedAt ?? 0,
        })
      }
    })
    replace()
  }

  clearAgentConversations(): void {
    this.db.prepare('DELETE FROM agent_conversations').run()
  }
}
