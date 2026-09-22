import { useEffect, useRef, useState } from 'react'
import { OBJECT_ASSET_MAP, STAMP_ASSET_MAP, type CustomImageAsset, type ObjectStampType, type StampType } from '../stamps'

export function useStampImages(customAssets: readonly CustomImageAsset[] = []): Map<StampType | ObjectStampType, HTMLImageElement> | null {
  const [images, setImages] = useState<Map<StampType | ObjectStampType, HTMLImageElement> | null>(null)
  const [customImages, setCustomImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const customCache = useRef(new Map<string, { src: string; image: HTMLImageElement }>())

  useEffect(() => {
    const map = new Map<StampType | ObjectStampType, HTMLImageElement>()
    const allUrls: Array<[StampType | ObjectStampType, string]> = [
      ...(Object.entries(STAMP_ASSET_MAP) as Array<[StampType, string]>),
      ...(Object.entries(OBJECT_ASSET_MAP) as Array<[ObjectStampType, string]>),
    ]
    let loaded = 0
    let cancelled = false

    const finish = () => {
      loaded++
      if (!cancelled && loaded === allUrls.length) setImages(new Map(map))
    }

    for (const [type, url] of allUrls) {
      const img = new window.Image()
      img.onload = finish
      img.onerror = finish
      img.src = url
      map.set(type, img)
    }
    if (allUrls.length === 0) setImages(map)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const map = new Map<string, HTMLImageElement>()
    const entries = customAssets.map(asset => [asset.type, asset.dataUrl] as const)
    let pending = entries.length
    const finish = () => {
      pending--
      if (!cancelled && pending <= 0) setCustomImages(new Map(map))
    }
    if (pending === 0) {
      setCustomImages(new Map())
      return () => { cancelled = true }
    }
    for (const [type, src] of entries) {
      const cached = customCache.current.get(type)
      if (cached?.src === src && cached.image.complete) {
        map.set(type, cached.image)
        finish()
        continue
      }
      const image = new window.Image()
      customCache.current.set(type, { src, image })
      map.set(type, image)
      image.onload = finish
      image.onerror = finish
      image.src = src
    }
    return () => { cancelled = true }
  }, [customAssets])

  if (!images) return null
  return new Map([...images, ...customImages])
}
