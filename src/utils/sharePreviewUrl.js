const previewVersion = 'logo-20261009'

export function sharePreviewUrl(value) {
  const url = new URL(value)
  url.searchParams.set('vista', previewVersion)
  return url.toString()
}
