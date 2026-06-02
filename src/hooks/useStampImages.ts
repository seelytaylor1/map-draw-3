import { useEffect, useState } from 'react'
import { type StampType, type ObjectStampType } from '../stamps'
import doorUrl from '../stamps/door.svg?url'
import trapUrl from '../stamps/trap.svg?url'
import starUrl from '../stamps/star.svg?url'
import barsUrl from '../stamps/bars.svg?url'
import stairsUrl from '../stamps/stairs.svg?url'
import archwayUrl from '../stamps/archway.svg?url'

const STAMP_URLS: Record<StampType, string> = {
  door: doorUrl,
  trap: trapUrl,
  star: starUrl,
  bars: barsUrl,
  stairs: stairsUrl,
}

const OBJECT_STAMP_URLS: Record<ObjectStampType, string> = {
  archway: archwayUrl,
}

export function useStampImages(): Map<StampType | ObjectStampType, HTMLImageElement> | null {
  const [images, setImages] = useState<Map<StampType | ObjectStampType, HTMLImageElement> | null>(null)

  useEffect(() => {
    const map = new Map<StampType | ObjectStampType, HTMLImageElement>()
    const allUrls: Array<[StampType | ObjectStampType, string]> = [
      ...(Object.entries(STAMP_URLS) as Array<[StampType, string]>),
      ...(Object.entries(OBJECT_STAMP_URLS) as Array<[ObjectStampType, string]>),
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
