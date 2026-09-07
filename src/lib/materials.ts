export function isHtmlUrl(url: string): boolean {
  const path = url.split('?')[0]
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return ext === 'html' || ext === 'htm'
}

export function materialHref(url: string, title: string): string {
  if (isHtmlUrl(url)) {
    return `/material?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
  }
  return url
}
