import { useEffect, useState } from 'react'
import { type StampType } from '../stamps'
import doorUrl from '../stamps/door.svg?url'
import trapUrl from '../stamps/trap.svg?url'
import starUrl from '../stamps/star.svg?url'
import barsUrl from '../stamps/bars.svg?url'
import stairsUrl from '../stamps/stairs.svg?url'

const STAMP_URLS: Record<StampType, string> = {
  door: doorUrl,
  trap: trapUrl,
  star: starUrl,
  bars: barsUrl,
  stairs: stairsUrl,
}

export function useStampImages(): Map<StampType, HTMLImageElement> | null {
  const [images, setImages] = useState<Map<StampType, HTMLImageElement> | null>(null)

  useEffect(() => {
    const map = new Map<StampType, HTMLImageElement>()
    const types = Object.keys(STAMP_URLS) as StampType[]
    let loaded = 0

    for (const type of types) {
      const img = new window.Image()
      img.onload = () => {
        loaded++
        if (loaded === types.length) setImages(new Map(map))
      }
      img.src = STAMP_URLS[type]
      map.set(type, img)
    }
  }, [])

  return images
}
