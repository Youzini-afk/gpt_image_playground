import { useEffect } from 'react'
import { initStore, initStorageMode, waitForStoreHydration } from './store'
import { useStore } from './store'
import { normalizeBaseUrl } from './lib/api'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'

async function clearLegacyServiceWorkerCache(): Promise<void> {
  const cleanup: Promise<unknown>[] = []

  if ('serviceWorker' in navigator) {
    cleanup.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
    )
  }

  if ('caches' in window) {
    cleanup.push(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))))
  }

  await Promise.all(cleanup).catch((error) => {
    console.error('legacy cache cleanup failed:', error)
  })
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  useDockerApiUrlMigrationNotice()

  useEffect(() => {
    const bootstrap = async () => {
      await clearLegacyServiceWorkerCache()
      await waitForStoreHydration()

      const searchParams = new URLSearchParams(window.location.search)
      const nextSettings: Partial<Pick<AppSettings, 'baseUrl' | 'apiKey' | 'codexCli' | 'apiMode' | 'editImageField'>> = {}

      const apiUrlParam = searchParams.get('apiUrl')
      if (apiUrlParam !== null) {
        nextSettings.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
      }

      const apiKeyParam = searchParams.get('apiKey')
      if (apiKeyParam !== null) {
        nextSettings.apiKey = apiKeyParam.trim()
      }

      const codexCliParam = searchParams.get('codexCli')
      if (codexCliParam !== null) {
        nextSettings.codexCli = codexCliParam.trim().toLowerCase() === 'true'
      }

      const apiModeParam = searchParams.get('apiMode')
      if (apiModeParam === 'images' || apiModeParam === 'responses') {
        nextSettings.apiMode = apiModeParam
      }

      const editImageFieldParam = searchParams.get('editImageField')
      if (editImageFieldParam === 'image' || editImageFieldParam === 'image[]') {
        nextSettings.editImageField = editImageFieldParam
      }

      setSettings(nextSettings)

      if (
        searchParams.has('apiUrl') ||
        searchParams.has('apiKey') ||
        searchParams.has('codexCli') ||
        searchParams.has('apiMode') ||
        searchParams.has('editImageField')
      ) {
        searchParams.delete('apiUrl')
        searchParams.delete('apiKey')
        searchParams.delete('codexCli')
        searchParams.delete('apiMode')
        searchParams.delete('editImageField')

        const nextSearch = searchParams.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
        window.history.replaceState(null, '', nextUrl)
      }

      await initStorageMode()
      await initStore()
    }

    void bootstrap()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
