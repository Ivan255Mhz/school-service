import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export function MaterialViewer() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const url = params.get('url')
  const title = params.get('title') || 'Материал'
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) return
    const path = url.split('?')[0]
    const ext = path.split('.').pop()?.toLowerCase() || ''
    if (ext === 'html' || ext === 'htm') {
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error('load failed')
          return r.text()
        })
        .then(setHtml)
        .catch(() => setError(true))
    } else {
      window.location.replace(url)
    }
  }, [url])

  if (!url) {
    return <div className="material-viewer"><div className="material-viewer-error">Файл не найден</div></div>
  }

  const path = url.split('?')[0]
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const isHtml = ext === 'html' || ext === 'htm'

  if (!isHtml) {
    return <div className="material-viewer"><div className="material-viewer-loading">Открываем файл...</div></div>
  }

  return (
    <div className="material-viewer">
      <header className="material-viewer-header">
        <button onClick={() => navigate(-1)} className="btn btn-back">
          &larr; Назад
        </button>
        <span className="material-viewer-title">{title}</span>
      </header>
      {error ? (
        <div className="material-viewer-error">Не удалось загрузить файл</div>
      ) : html === null ? (
        <div className="material-viewer-loading">Загрузка...</div>
      ) : (
        <iframe
          className="material-viewer-frame"
          srcDoc={html}
          sandbox="allow-scripts allow-popups"
          title={title}
        />
      )}
    </div>
  )
}
