import { useEffect, useState } from 'react'
import { type StampType, type ObjectStampType } from '../stamps'
import doorUrl from '../stamps/door.svg?url'
import secretDoorUrl from '../stamps/secret-door.svg?url'
import trapUrl from '../stamps/trap.svg?url'
import starUrl from '../stamps/star.svg?url'
import barsUrl from '../stamps/bars.svg?url'
import isoArchwayUrl from '../iso-objects/archway.svg?url'
import isoBigpillarUrl from '../iso-objects/bigpillar.svg?url'
import isoIronDoorUrl from '../iso-objects/iron-door.svg?url'
import isoPassagewayArchUrl from '../iso-objects/passageway-arch.svg?url'
import isoPillarUrl from '../iso-objects/pillar.svg?url'
import isoPortculisUrl from '../iso-objects/portculis.svg?url'
import isoRampUrl from '../iso-objects/ramp.svg?url'
import isoWellUrl from '../iso-objects/well.svg?url'
import isoWoodDoorUrl from '../iso-objects/wood-door.svg?url'
import isoWoodDoubledoorUrl from '../iso-objects/wood-doubledoor.svg?url'

const STAMP_URLS: Record<StampType, string> = {
  door: doorUrl,
  'secret-door': secretDoorUrl,
  trap: trapUrl,
  star: starUrl,
  bars: barsUrl,
}

const OBJECT_STAMP_URLS: Record<ObjectStampType, string> = {
  archway: isoArchwayUrl,
  bigpillar: isoBigpillarUrl,
  'iron-door': isoIronDoorUrl,
  'passageway-arch': isoPassagewayArchUrl,
  pillar: isoPillarUrl,
  portculis: isoPortculisUrl,
  ramp: isoRampUrl,
  well: isoWellUrl,
  'wood-door': isoWoodDoorUrl,
  'wood-doubledoor': isoWoodDoubledoorUrl,
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
