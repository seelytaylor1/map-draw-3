import { describe, expect, it } from 'vitest'
import { isoProject, isoFloorPoints, isoFrontFacePoints, isoEastFacePoints } from './iso'

describe('isoProject', () => {
  it('origin stays at origin', () => {
    expect(isoProject(0, 0, 32, 32)).toEqual({ x: 0, y: 0 })
  })

  it('col+1 moves right and down', () => {
    expect(isoProject(1, 0, 32, 32)).toEqual({ x: 16, y: 16 })
  })

  it('row+1 moves left and down', () => {
    expect(isoProject(0, 1, 32, 32)).toEqual({ x: -16, y: 16 })
  })

  it('diagonal col+row projects to bottom', () => {
    expect(isoProject(1, 1, 32, 32)).toEqual({ x: 0, y: 32 })
  })

  it('respects non-square tile dimensions', () => {
    expect(isoProject(1, 0, 40, 20)).toEqual({ x: 20, y: 10 })
  })
})

describe('isoFloorPoints', () => {
  it('returns 8-element flat array (4 diamond corners)', () => {
    const pts = isoFloorPoints(0, 0, 32, 32)
    expect(pts).toHaveLength(8)
  })

  it('tile (0,0) top corner is at origin', () => {
    const [x0, y0] = isoFloorPoints(0, 0, 32, 32)
    expect(x0).toBe(0)
    expect(y0).toBe(0)
  })

  it('tile (0,0) forms correct diamond: top, right, bottom, left', () => {
    const pts = isoFloorPoints(0, 0, 32, 32)
    const [x0, y0, x1, y1, x2, y2, x3, y3] = pts
    expect({ x: x0, y: y0 }).toEqual({ x: 0, y: 0 })    // top
    expect({ x: x1, y: y1 }).toEqual({ x: 16, y: 16 })  // right
    expect({ x: x2, y: y2 }).toEqual({ x: 0, y: 32 })   // bottom
    expect({ x: x3, y: y3 }).toEqual({ x: -16, y: 16 }) // left
  })

  it('adjacent tiles share edges (no gaps in floor)', () => {
    // shared edge between (0,0) and (1,0): from (right of 00) to (bottom of 00)
    // = from (top of 10) to (left of 10)
    const tile00 = isoFloorPoints(0, 0, 32, 32)
    const tile10 = isoFloorPoints(1, 0, 32, 32)
    expect([tile00[2], tile00[3]]).toEqual([tile10[0], tile10[1]]) // right00 == top10
    expect([tile00[4], tile00[5]]).toEqual([tile10[6], tile10[7]]) // bottom00 == left10
  })
})

describe('isoFrontFacePoints', () => {
  it('returns 8 values (4 corners of parallelogram)', () => {
    expect(isoFrontFacePoints(0, 0, 32, 32, 8)).toHaveLength(8)
  })

  it('top edge matches left+bottom vertices of floor diamond', () => {
    const floor = isoFloorPoints(0, 0, 32, 32)
    const face = isoFrontFacePoints(0, 0, 32, 32, 8)
    // floor: [top, right, bottom, left] as [x0,y0, x1,y1, x2,y2, x3,y3]
    const floorLeft = [floor[6], floor[7]]
    const floorBottom = [floor[4], floor[5]]
    expect([face[0], face[1]]).toEqual(floorLeft)
    expect([face[2], face[3]]).toEqual(floorBottom)
  })

  it('bottom edge is faceH below top edge', () => {
    const face = isoFrontFacePoints(0, 0, 32, 32, 8)
    expect(face[5]).toBe(face[3] + 8)  // bottom.y = bottom.y + faceH
    expect(face[7]).toBe(face[1] + 8)  // left.y = left.y + faceH
    expect(face[4]).toBe(face[2])      // bottom x unchanged
    expect(face[6]).toBe(face[0])      // left x unchanged
  })

  it('adjacent south faces share corners (no gaps)', () => {
    // face for (0,0) and face for (1,0) share the bottom vertex column
    const face00 = isoFrontFacePoints(0, 0, 32, 32, 8)
    const face10 = isoFrontFacePoints(1, 0, 32, 32, 8)
    // face00 top-right corner = isoProject(1,1) = face10 top-left corner = isoProject(1,1)
    expect([face00[2], face00[3]]).toEqual([face10[0], face10[1]])
  })
})

describe('isoEastFacePoints', () => {
  it('returns 8 values (4 corners of parallelogram)', () => {
    expect(isoEastFacePoints(0, 0, 32, 32, 8)).toHaveLength(8)
  })

  it('top edge matches right+bottom vertices of floor diamond', () => {
    const floor = isoFloorPoints(0, 0, 32, 32)
    const face = isoEastFacePoints(0, 0, 32, 32, 8)
    const floorRight = [floor[2], floor[3]]
    const floorBottom = [floor[4], floor[5]]
    expect([face[0], face[1]]).toEqual(floorRight)
    expect([face[2], face[3]]).toEqual(floorBottom)
  })

  it('bottom edge is faceH below top edge', () => {
    const face = isoEastFacePoints(0, 0, 32, 32, 8)
    expect(face[5]).toBe(face[3] + 8)
    expect(face[7]).toBe(face[1] + 8)
    expect(face[4]).toBe(face[2])
    expect(face[6]).toBe(face[0])
  })
})
