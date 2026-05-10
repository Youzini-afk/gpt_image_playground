import { useState, useEffect, useRef, memo } from 'react'
import type { CanvasImage } from '../types'
import { useStore, ensureImageCached, ensureImageThumbnailCached, subscribeImageThumbnail, removeCanvasImage, addCanvasImageToInput } from '../store'
import { copyBlobToClipboard, getClipboardFailureMessage } from '../lib/clipboard'

function CanvasImageCard({ canvasImage }: { canvasImage: CanvasImage }) {
  const [thumbSrc, setThumbSrc] = useState<string>('')
  const showToast = useStore((s) => s.showToast)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const isInInput = useStore((s) => s.inputImages.some((i) => i.id === canvasImage.imageId))
  const [menuOpen, setMenuOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [shouldLoadThumb, setShouldLoadThumb] = useState(false)

  useEffect(() => {
    if (shouldLoadThumb) return
    const element = cardRef.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoadThumb(true)
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadThumb(true)
        observer.disconnect()
      }
    }, { rootMargin: '800px 0px' })

    observer.observe(element)
    return () => observer.disconnect()
  }, [shouldLoadThumb])

  useEffect(() => {
    let cancelled = false
    setThumbSrc('')
    if (!shouldLoadThumb) return

    const unsubscribe = subscribeImageThumbnail(canvasImage.imageId, (thumbnail) => {
      if (!cancelled) setThumbSrc(thumbnail.dataUrl)
    })
    ensureImageThumbnailCached(canvasImage.imageId).then((thumbnail) => {
      if (!cancelled && thumbnail) setThumbSrc(thumbnail.dataUrl)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [canvasImage.imageId, shouldLoadThumb])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }

  const handleCopy = async () => {
    setMenuOpen(false)
    try {
      const dataUrl = await ensureImageCached(canvasImage.imageId)
      if (!dataUrl) {
        showToast('图片数据已不存在', 'error')
        return
      }
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      await copyBlobToClipboard(blob)
      showToast('图片已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制失败', err), 'error')
    }
  }

  const handleDownload = async () => {
    setMenuOpen(false)
    try {
      const dataUrl = await ensureImageCached(canvasImage.imageId)
      if (!dataUrl) {
        showToast('图片数据已不存在', 'error')
        return
      }
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = blob.type.split('/')[1] || 'png'
      a.download = `canvas-${Date.now()}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('开始下载', 'success')
    } catch (err) {
      showToast('下载失败', 'error')
    }
  }

  const handleAddToInput = () => {
    setMenuOpen(false)
    addCanvasImageToInput(canvasImage)
  }

  const handleDelete = () => {
    setMenuOpen(false)
    removeCanvasImage(canvasImage)
  }

  return (
    <div ref={cardRef} className="relative rounded-xl" onContextMenu={handleContextMenu}>
      <div className="relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden cursor-pointer hover:shadow-lg dark:hover:bg-gray-800/80 transition-[box-shadow,border-color,background-color]">
        <div className="w-full aspect-square bg-gray-100 dark:bg-black/20 relative flex items-center justify-center overflow-hidden">
          {thumbSrc ? (
            <img src={thumbSrc} className="saveable-image w-full h-full object-cover" loading="lazy" decoding="async" alt="" />
          ) : (
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          <div className="absolute top-1.5 left-1.5">
            <span className="bg-blue-500/80 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-medium">
              参考
            </span>
          </div>
          {isInInput && (
            <div className="absolute top-1.5 right-1.5">
              <span className="bg-green-500/80 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-medium">
                使用中
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" onClick={() => {
            setLightboxImageId(canvasImage.imageId, [canvasImage.imageId])
          }} />
        </div>
        <div className="p-2 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleAddToInput}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-xs font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {isInInput ? '已添加' : '做参考'}
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setMenuOpen(false)} />
          <div className="absolute z-[81] right-0 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 w-[140px] overflow-hidden animate-fade-in">
            <button
              onClick={handleAddToInput}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              做参考图
            </button>
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制图片
            </button>
            <button
              onClick={handleDownload}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default memo(CanvasImageCard)
