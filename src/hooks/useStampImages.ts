import { useEffect, useState } from 'react'
import { OBJECT_ASSET_MAP, STAMP_ASSET_MAP, type ObjectStampType, type StampType } from '../stamps'

export function useStampImages(): Map<StampType | ObjectStampType, HTMLImageElement> | null {
  const [images, setImages] = useState<Map<StampType | ObjectStampType, HTMLImageElement> | null>(null)

  useEffect(() => {
    const map = new Map<StampType | ObjectStampType, HTMLImageElement>()
    const allUrls: Array<[StampType | ObjectStampType, string]> = [
      ...(Object.entries(STAMP_ASSET_MAP) as Array<[StampType, string]>),
      ...(Object.entries(OBJECT_ASSET_MAP) as Array<[ObjectStampType, string]>),
    ]
    let loaded = 0

    for (const [type, url] of allUrls) {
      const img = new window.Image()
      img.onload = () => {
        loaded++
        if (loaded === allUrls.length) setImages(new Map(map))
      }
      img.src = url
      map.set(type, img)
    }
  }, [])

  return images
}
