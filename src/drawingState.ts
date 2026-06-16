import { FLOOR, WALL, type TileState } from './constants'
import type { StampType, ObjectStampType } from './stamps'
import type { TileFlip } from './noise'

export type BrushShape = 'square' | 'circle'

export interface Tile { col: number; row: number }

export type DrawingState =
  | { tool: 'paint';  phase: 'idle';      paintValue: TileState; brushShape: BrushShape }
  | { tool: 'paint';  phase: 'selecting'; paintValue: TileState; idlePaintValue: TileState; brushShape: BrushShape; start: Tile; end: Tile }
  | { tool: 'rough';  phase: 'idle' }
  | { tool: 'rough';  phase: 'placed1';   start: Tile; end: Tile }
  | { tool: 'rough';  phase: 'placed2';   start: Tile; end: Tile; seed: number; preview: TileFlip[]; baseGrid: Uint8Array }
  | { tool: 'steps';  selectedId: string | null }
  | { tool: 'ramps';  selectedId: string | null }
  | { tool: 'label';  phase: 'idle';      selectedId: string | null }
  | { tool: 'label';  phase: 'placing' }
  | { tool: 'stamp';  stampType: StampType | ObjectStampType; selectedId: string | null }

export type DrawingAction =
  | { type: 'SET_TOOL';          to: DrawingState }
  | { type: 'PAINT_START';       tile: Tile; button: 0 | 2 }
  | { type: 'PAINT_UPDATE';      tile: Tile }
  | { type: 'PAINT_COMMIT' }
  | { type: 'PAINT_SET_VALUE';   paintValue: TileState }
  | { type: 'PAINT_SET_BRUSH';   brushShape: BrushShape }
  | { type: 'ROUGH_CLICK';       tile: Tile }
  | { type: 'ROUGH_UPDATE_RECT'; tile: Tile }
  | { type: 'ROUGH_COMMIT_RECT'; end: Tile; seed: number; baseGrid: Uint8Array }
  | { type: 'ROUGH_UPDATE_NOISE';preview: TileFlip[] }
  | { type: 'ROUGH_COMMIT' }
  | { type: 'SELECT';            id: string | null }
  | { type: 'LABEL_START_PLACING' }
  | { type: 'LABEL_PLACED';      id: string }
  | { type: 'ESCAPE' }

export const INITIAL_DRAWING_STATE: DrawingState = {
  tool: 'paint',
  phase: 'idle',
  paintValue: FLOOR,
  brushShape: 'square',
}

export function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case 'SET_TOOL':
      return action.to

    case 'PAINT_START': {
      if (state.tool !== 'paint' || state.phase !== 'idle') return state
      const strokeValue: TileState = action.button === 2 ? WALL : state.paintValue
      return {
        tool: 'paint', phase: 'selecting',
        paintValue: strokeValue, idlePaintValue: state.paintValue,
        brushShape: state.brushShape, start: action.tile, end: action.tile,
      }
    }

    case 'PAINT_UPDATE':
      if (state.tool !== 'paint' || state.phase !== 'selecting') return state
      return { ...state, end: action.tile }

    case 'PAINT_COMMIT':
      if (state.tool !== 'paint' || state.phase !== 'selecting') return state
      return { tool: 'paint', phase: 'idle', paintValue: state.idlePaintValue, brushShape: state.brushShape }

    case 'PAINT_SET_VALUE':
      if (state.tool !== 'paint') return state
      if (state.phase === 'idle') return { ...state, paintValue: action.paintValue }
      return { ...state, idlePaintValue: action.paintValue }

    case 'PAINT_SET_BRUSH':
      if (state.tool !== 'paint') return state
      return { ...state, brushShape: action.brushShape }

    case 'ROUGH_CLICK': {
      if (state.tool !== 'rough') return state
      if (state.phase === 'idle')
        return { tool: 'rough', phase: 'placed1', start: action.tile, end: action.tile }
      if (state.phase === 'placed2')
        return { tool: 'rough', phase: 'idle' }
      return state
    }

    case 'ROUGH_UPDATE_RECT':
      if (state.tool !== 'rough' || state.phase !== 'placed1') return state
      return { ...state, end: action.tile }

    case 'ROUGH_COMMIT_RECT':
      if (state.tool !== 'rough' || state.phase !== 'placed1') return state
      return {
        tool: 'rough', phase: 'placed2',
        start: state.start, end: action.end,
        seed: action.seed, preview: [], baseGrid: action.baseGrid,
      }

    case 'ROUGH_UPDATE_NOISE':
      if (state.tool !== 'rough' || state.phase !== 'placed2') return state
      return { ...state, preview: action.preview }

    case 'ROUGH_COMMIT':
      if (state.tool !== 'rough' || state.phase !== 'placed2') return state
      return { tool: 'rough', phase: 'idle' }

    case 'SELECT': {
      if (state.tool === 'steps') return { ...state, selectedId: action.id }
      if (state.tool === 'ramps') return { ...state, selectedId: action.id }
      if (state.tool === 'stamp') return { ...state, selectedId: action.id }
      if (state.tool === 'label' && state.phase === 'idle') return { ...state, selectedId: action.id }
      return state
    }

    case 'LABEL_START_PLACING':
      return { tool: 'label', phase: 'placing' }

    case 'LABEL_PLACED':
      return { tool: 'label', phase: 'idle', selectedId: action.id }

    case 'ESCAPE': {
      // Caller must restore baseGrid to history before dispatching when tool=rough/placed2
      if (state.tool === 'rough') return { tool: 'rough', phase: 'idle' }
      if (state.tool === 'paint' && state.phase === 'selecting')
        return { tool: 'paint', phase: 'idle', paintValue: state.idlePaintValue, brushShape: state.brushShape }
      if (state.tool === 'steps') return { ...state, selectedId: null }
      if (state.tool === 'ramps') return { ...state, selectedId: null }
      if (state.tool === 'stamp') return { ...state, selectedId: null }
      if (state.tool === 'label') return { tool: 'label', phase: 'idle', selectedId: null }
      return state
    }

    default:
      return state
  }
}
