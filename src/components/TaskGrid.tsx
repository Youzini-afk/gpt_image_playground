import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useStore, reuseConfig, editOutputs, removeTask } from '../store'
import { getFilteredTasks } from '../lib/tasks'
import { selectionBoxRect, deriveSelection, type CardGeometry } from '../lib/selectionGeometry'
import TaskCard from './TaskCard'
import CanvasImageCard from './CanvasImageCard'

const INITIAL_VISIBLE_TASKS = 60
const VISIBLE_TASK_INCREMENT = 60

export default function TaskGrid() {
  const tasks = useStore((s) => s.tasks)
  const canvasImages = useStore((s) => s.canvasImages)
  const searchQuery = useStore((s) => s.searchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ startPageX: number; startPageY: number; currentPageX: number; currentPageY: number } | null>(null)
  const dragStart = useRef<{ pageX: number; pageY: number } | null>(null)
  const lastClientPoint = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const isDragging = useRef(false)
  const dragScrollIntervalRef = useRef<number | null>(null)
  const dragScrollDirectionRef = useRef<-1 | 1 | null>(null)
  const lastToastTimeRef = useRef(0)
  const suppressClickUntil = useRef(0)
  const startedOnCard = useRef(false)
  const startedWithCtrl = useRef(false)
  const initialSelection = useRef<string[]>([])
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
  const cardGeometriesRef = useRef<CardGeometry[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)
  const autoLoadCooldownRef = useRef(false)

  const visibleTaskFilterKey = `${searchQuery}\u0000${filterStatus}\u0000${filterFavorite ? '1' : '0'}`
  const [visibleTaskWindow, setVisibleTaskWindow] = useState({
    key: visibleTaskFilterKey,
    count: INITIAL_VISIBLE_TASKS,
  })

  useEffect(() => {
    setVisibleTaskWindow({ key: visibleTaskFilterKey, count: INITIAL_VISIBLE_TASKS })
  }, [visibleTaskFilterKey])

  const filteredTasks = useMemo(() => {
    return getFilteredTasks(tasks, searchQuery, filterStatus, filterFavorite)
  }, [tasks, searchQuery, filterStatus, filterFavorite])

  const visibleTaskCount = visibleTaskWindow.key === visibleTaskFilterKey
    ? visibleTaskWindow.count
    : INITIAL_VISIBLE_TASKS

  const visibleTasks = useMemo(() => {
    return filteredTasks.slice(0, visibleTaskCount)
  }, [filteredTasks, visibleTaskCount])

  const hiddenTaskCount = filteredTasks.length - visibleTasks.length

  useEffect(() => {
    if (!sentinelRef.current || hiddenTaskCount <= 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !autoLoadCooldownRef.current) {
            autoLoadCooldownRef.current = true
            setVisibleTaskWindow((current) => ({
              key: visibleTaskFilterKey,
              count: (current.key === visibleTaskFilterKey ? current.count : INITIAL_VISIBLE_TASKS) + VISIBLE_TASK_INCREMENT,
            }))
            window.setTimeout(() => {
              autoLoadCooldownRef.current = false
            }, 300)
          }
        }
      },
      { rootMargin: '100px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hiddenTaskCount, visibleTaskFilterKey])

  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])

  const handleCardClick = useCallback((task: typeof tasks[0], e: React.MouseEvent | React.TouchEvent) => {
    if (Date.now() < suppressClickUntil.current) {
      e.preventDefault()
      return
    }
    suppressClickUntil.current = 0
    const isCtrl = isMac ? e.metaKey : e.ctrlKey
    if (isCtrl) {
      useStore.getState().toggleTaskSelection(task.id)
    } else if (useStore.getState().selectedTaskIds.length > 0) {
      clearSelection()
      setDetailTaskId(task.id)
    } else {
      setDetailTaskId(task.id)
    }
  }, [isMac, clearSelection, setDetailTaskId])

  const handleReuseTask = useCallback((task: typeof tasks[0]) => {
    reuseConfig(task)
  }, [])

  const handleEditOutputsTask = useCallback((task: typeof tasks[0]) => {
    editOutputs(task)
  }, [])

  const handleDeleteTask = useCallback((task: typeof tasks[0]) => {
    setConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条记录吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }, [setConfirmDialog])

  const getPagePoint = (clientX: number, clientY: number) => ({
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
  })

  const measureCardGeometries = () => {
    if (!gridRef.current) return
    const cards = gridRef.current.querySelectorAll('.task-card-wrapper')
    const geometries: CardGeometry[] = []
    cards.forEach((card) => {
      const taskId = card.getAttribute('data-task-id')
      if (!taskId) return
      const rect = card.getBoundingClientRect()
      geometries.push({
        taskId,
        rect: {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          right: rect.right + window.scrollX,
          bottom: rect.bottom + window.scrollY,
        },
      })
    })
    cardGeometriesRef.current = geometries
  }

  const beginSelection = (target: HTMLElement, clientX: number, clientY: number, isCtrl: boolean) => {
    const point = getPagePoint(clientX, clientY)

    startedOnCard.current = Boolean(target.closest('.task-card-wrapper'))
    startedWithCtrl.current = isCtrl
    initialSelection.current = [...useStore.getState().selectedTaskIds]

    isDragging.current = true
    hasDragged.current = false
    dragStart.current = point
    lastClientPoint.current = { x: clientX, y: clientY }
    document.body.classList.add('select-none')
    document.body.classList.add('drag-selecting')
    measureCardGeometries()
    setSelectionBox({
      startPageX: point.pageX,
      startPageY: point.pageY,
      currentPageX: point.pageX,
      currentPageY: point.pageY,
    })
  }

  const updateSelectionFromPoint = (pageX: number, pageY: number) => {
    const start = dragStart.current
    if (!start || !gridRef.current) return

    const rect = selectionBoxRect(start.pageX, start.pageY, pageX, pageY)
    const newSelected = deriveSelection(
      cardGeometriesRef.current,
      rect,
      initialSelection.current,
    )
    setSelectedTaskIds(newSelected)
  }

  useEffect(() => {
    const stopDragScroll = () => {
      if (dragScrollIntervalRef.current) {
        clearInterval(dragScrollIntervalRef.current)
        dragScrollIntervalRef.current = null
      }
      dragScrollDirectionRef.current = null
    }

    const startDragScroll = (direction: -1 | 1) => {
      if (dragScrollIntervalRef.current && dragScrollDirectionRef.current === direction) return
      stopDragScroll()
      dragScrollDirectionRef.current = direction
      dragScrollIntervalRef.current = window.setInterval(() => {
        window.scrollBy({ top: direction * 15, behavior: 'instant' })
      }, 16)
    }

    const endSelection = (clearEmptySurfaceClick = false, suppressClick = false) => {
      if (isDragging.current) {
        document.body.classList.remove('select-none')
        document.body.classList.remove('drag-selecting')
      }
      if (isDragging.current && clearEmptySurfaceClick && !hasDragged.current && !startedOnCard.current && !startedWithCtrl.current) {
        clearSelection()
      }
      if (isDragging.current && suppressClick && hasDragged.current) {
        suppressClickUntil.current = Date.now() + 250
      }
      stopDragScroll()
      isDragging.current = false
      dragStart.current = null
      lastClientPoint.current = null
      setSelectionBox(null)
    }

    const getEventElement = (e: MouseEvent) => {
      if (e.target instanceof Element) return e.target
      return document.elementFromPoint(e.clientX, e.clientY)
    }

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = getEventElement(e)
      if (!target) return
      if (!target.closest('[data-drag-select-surface]')) return
      if (target.closest('[data-input-bar]')) return
      if (target.closest('[data-no-drag-select], [data-lightbox-root]')) return
      if (target.closest('button, a, input, textarea, select')) return

      const isCtrl = isMac ? e.metaKey : e.ctrlKey
      beginSelection(target as HTMLElement, e.clientX, e.clientY, isCtrl)
      e.preventDefault()
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return

      const start = dragStart.current
      const point = getPagePoint(e.clientX, e.clientY)
      lastClientPoint.current = { x: e.clientX, y: e.clientY }
      const distance = Math.hypot(point.pageX - start.pageX, point.pageY - start.pageY)
      if (distance < 6 && !hasDragged.current) return

      hasDragged.current = true
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
      e.preventDefault()

      const scrollThreshold = 40
      if (e.clientY < scrollThreshold) {
        startDragScroll(-1)
      } else if (e.clientY > window.innerHeight - scrollThreshold) {
        startDragScroll(1)
      } else {
        stopDragScroll()
      }
    }

    const handleDocumentScroll = () => {
      if (!isDragging.current || !dragStart.current || !lastClientPoint.current || !hasDragged.current) return
      measureCardGeometries()

      const point = getPagePoint(lastClientPoint.current.x, lastClientPoint.current.y)
      const start = dragStart.current
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
    }

    const handleResize = () => {
      if (!isDragging.current || !dragStart.current || !lastClientPoint.current || !hasDragged.current) return
      measureCardGeometries()

      const point = getPagePoint(lastClientPoint.current.x, lastClientPoint.current.y)
      const start = dragStart.current
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
    }

    const handleDocumentWheel = (e: WheelEvent) => {
      if (!isDragging.current) return
      if ((e.buttons & 1) === 0) {
        endSelection()
        return
      }
      if (!hasDragged.current) return
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()
      const now = Date.now()
      if (now - lastToastTimeRef.current > 3000) {
        lastToastTimeRef.current = now
        const keyName = isMac ? '⌘' : 'Ctrl'
        useStore.getState().showToast(`松开 ${keyName} 键使用滚轮，或拖至边缘自动滚动`, 'info')
      }
    }

    const handleDocumentMouseUp = () => {
      endSelection(true, true)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    document.addEventListener('mousemove', handleDocumentMouseMove, true)
    document.addEventListener('mouseup', handleDocumentMouseUp, true)
    document.addEventListener('wheel', handleDocumentWheel, { capture: true, passive: false })
    window.addEventListener('scroll', handleDocumentScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      stopDragScroll()
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('mousemove', handleDocumentMouseMove, true)
      document.removeEventListener('mouseup', handleDocumentMouseUp, true)
      document.removeEventListener('wheel', handleDocumentWheel, true)
      window.removeEventListener('scroll', handleDocumentScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [clearSelection, isMac])

  if (!filteredTasks.length && !canvasImages.length) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-gray-500">
        {searchQuery || filterFavorite ? (
          <p className="text-sm">没有找到匹配的记录</p>
        ) : (
          <>
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-200 dark:text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm">输入提示词开始生成图片</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={rootRef}
      data-task-grid-root
      className="relative min-h-[50vh]"
    >
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
        {canvasImages.map((ci) => (
          <CanvasImageCard key={ci.id} canvasImage={ci} />
        ))}
        {visibleTasks.map((task) => (
          <div key={task.id} className="task-card-wrapper" data-task-id={task.id}>
            <TaskCard
              task={task}
              onClick={handleCardClick}
              onReuse={handleReuseTask}
              onEditOutputs={handleEditOutputsTask}
              onDelete={handleDeleteTask}
              isSelected={selectedTaskIdSet.has(task.id)}
            />
          </div>
        ))}
      </div>
      {hiddenTaskCount > 0 && (
        <>
          <div ref={sentinelRef} className="h-4" aria-hidden="true" />
          <div className="flex justify-center py-6">
            <button
              onClick={() => setVisibleTaskWindow((current) => ({
                key: visibleTaskFilterKey,
                count: (current.key === visibleTaskFilterKey ? current.count : INITIAL_VISIBLE_TASKS) + VISIBLE_TASK_INCREMENT,
              }))}
              className="px-5 py-2 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-sm text-gray-600 dark:text-gray-300 transition-all duration-200 shadow-sm"
            >
              再显示 {Math.min(VISIBLE_TASK_INCREMENT, hiddenTaskCount)} 条记录（剩余 {hiddenTaskCount} 条）
            </button>
          </div>
        </>
      )}
      {selectionBox && (
        <div
          className="fixed bg-blue-500/20 border border-blue-500/50 pointer-events-none z-[30]"
          style={{
            left: Math.min(selectionBox.startPageX, selectionBox.currentPageX) - window.scrollX,
            top: Math.min(selectionBox.startPageY, selectionBox.currentPageY) - window.scrollY,
            width: Math.abs(selectionBox.currentPageX - selectionBox.startPageX),
            height: Math.abs(selectionBox.currentPageY - selectionBox.startPageY),
          }}
        />
      )}
    </div>
  )
}
