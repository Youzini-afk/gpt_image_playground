import React, { useEffect, useState, useRef } from 'react'
import { useStore, addImageFromUrl, addImageToCanvas, ensureImageCached } from '../store'
import { copyImageSourceToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { downloadImageEntriesAsZip, downloadImageIds, formatExportFileTime, getImageZipEntries } from '../lib/downloadImages'
import { suppressGlobalClicks } from '../lib/clickSuppression'
import { CopyIcon, DownloadIcon, EditIcon } from './icons'

export default function ImageContextMenu() {
  const [menuInfo, setMenuInfo] = useState<{ src: string; imageId?: string; outputImageIds: string[]; x: number; y: number } | null>(null)
  const showToast = useStore((s) => s.showToast)
  const inputImages = useStore((s) => s.inputImages)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setMaskEditorImageId = useStore((s) => s.setMaskEditorImageId)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEmbeddedPage()) return

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target && target.tagName === 'IMG') {
        const imgTarget = target as HTMLImageElement
        if (!imgTarget.src) return

        const isIOS = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
        const isTouch = window.matchMedia('(pointer: coarse)').matches
        if (isIOS && isTouch) return

        e.preventDefault()
        setMenuInfo({
          src: imgTarget.src,
          imageId: imgTarget.dataset.imageId,
          outputImageIds: imgTarget.dataset.outputImageIds?.split(',').filter(Boolean) ?? [],
          x: e.clientX,
          y: e.clientY,
        })
      }
    }

    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  useEffect(() => {
    if (!menuInfo) return
    const close = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return
      }
      if (e.target instanceof Element && e.target.closest('[data-lightbox-root]')) {
        window.dispatchEvent(new Event('image-context-menu-dismiss-lightbox-click'))
      }
      if (e.type === 'mousedown' || e.type === 'touchstart') suppressGlobalClicks()
      setMenuInfo(null)
    }
    window.addEventListener('mousedown', close, { capture: true })
    window.addEventListener('touchstart', close, { capture: true })
    window.addEventListener('wheel', close, { capture: true })
    window.addEventListener('scroll', close, { capture: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close, { capture: true })
      window.removeEventListener('touchstart', close, { capture: true })
      window.removeEventListener('wheel', close, { capture: true })
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [menuInfo])

  if (!menuInfo) return null

  const getOriginalImageSrc = async () => {
    if (!menuInfo.imageId) return menuInfo.src
    return await ensureImageCached(menuInfo.imageId) ?? menuInfo.src
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuInfo(null)
    try {
      await copyImageSourceToClipboard(getOriginalImageSrc())
      showToast('图片已复制', 'success')
    } catch (err) {
      console.error(err)
      showToast(getClipboardFailureMessage('复制失败', err), 'error')
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const imageId = menuInfo.imageId
    const src = menuInfo.src
    setMenuInfo(null)

    try {
      let fileNameBase = ''
      if (imageId) {
        const tasks = useStore.getState().tasks
        const matchedTask = tasks.find(t => t.outputImages?.includes(imageId))
        if (matchedTask) {
          fileNameBase = `task-${matchedTask.id}`
        } else {
          fileNameBase = `image-${imageId}`
        }
      } else {
        const timeStr = formatExportFileTime(new Date())
        fileNameBase = `image-${timeStr}`
      }

      const result = await downloadImageIds([imageId || src], fileNameBase)
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else {
        showToast('下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const outputImageIds = menuInfo.outputImageIds
    setMenuInfo(null)
    if (outputImageIds.length <= 1) return

    try {
      let fileNameBase = ''
      if (outputImageIds[0]) {
        const tasks = useStore.getState().tasks
        const matchedTask = tasks.find(t => t.outputImages?.includes(outputImageIds[0]))
        if (matchedTask) {
          fileNameBase = `task-${matchedTask.id}`
        }
      }
      if (!fileNameBase) {
        const timeStr = formatExportFileTime(new Date())
        fileNameBase = `batch-${timeStr}`
      }

      const settings = useStore.getState().settings
      const result = settings.zipDownloadRoutes.includes('image-context-menu-all')
        ? await downloadImageEntriesAsZip(getImageZipEntries(outputImageIds, fileNameBase), fileNameBase)
        : await downloadImageIds(outputImageIds, fileNameBase)
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else if (result.failCount > 0) {
        showToast(`部分下载失败：成功 ${result.successCount}，失败 ${result.failCount}`, 'error')
      } else {
        showToast(result.successCount > 1 ? `下载成功：${result.successCount} 张图片` : '下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleAddToInput = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuInfo(null)
    if (inputImages.length >= 16) {
      showToast('参考图数量已达上限（16 张），无法继续添加', 'error')
      return
    }

    try {
      const src = await getOriginalImageSrc()
      await addImageFromUrl(src)
      setDetailTaskId(null)
      setLightboxImageId(null)
      setMaskEditorImageId(null)
      showToast('已加入参考图', 'success')
    } catch (err) {
      console.error(err)
      showToast(`加入参考图失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleAddToCanvas = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuInfo(null)
    try {
      const src = await getOriginalImageSrc()
      await addImageToCanvas(src)
      showToast('已添加到工作台', 'success')
    } catch (err) {
      console.error(err)
      showToast(`添加到工作台失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleEdit = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuInfo(null)
    if (inputImages.length >= 16) {
      showToast('参考图数量已达上限（16 张），无法继续添加', 'error')
      return
    }

    try {
      const src = await getOriginalImageSrc()
      await addImageFromUrl(src)
      setDetailTaskId(null)
      setLightboxImageId(null)
      setMaskEditorImageId(null)
      showToast('已加入参考图', 'success')
    } catch (err) {
      console.error(err)
      showToast(`加入参考图失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  let left = menuInfo.x
  let top = menuInfo.y
  const MENU_WIDTH = 140
  const showDownloadAll = menuInfo.outputImageIds.length > 1
  const MENU_HEIGHT = showDownloadAll ? 208 : 176

  if (left + MENU_WIDTH > window.innerWidth) {
    left -= MENU_WIDTH
  }
  if (top + MENU_HEIGHT > window.innerHeight) {
    top -= MENU_HEIGHT
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 w-[140px] overflow-hidden animate-fade-in"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={handleCopy}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
      >
        <CopyIcon className="w-4 h-4 flex-shrink-0" />
        复制
      </button>
      <button
        onClick={handleDownload}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
      >
        <DownloadIcon className="w-4 h-4 flex-shrink-0" />
        下载
      </button>
      {showDownloadAll && (
        <button
          onClick={handleDownloadAll}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
        >
          <DownloadIcon className="w-4 h-4 flex-shrink-0" />
          下载全部
        </button>
      )}
      <button
        onClick={handleAddToInput}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        做参考图
      </button>
      <button
        onClick={handleAddToCanvas}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        加到工作台
      </button>
      <button
        onClick={handleEdit}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
      >
        <EditIcon className="w-4 h-4 flex-shrink-0" />
        编辑
      </button>
    </div>
  )
}

function isEmbeddedPage() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
