import { STAMP_ASSET_MAP } from './stamps'
import { GENERATED_STAMP_TYPES, type GeneratedStampType } from './randomDungeon/generatedStampCatalog'

const generatedStampLabels: Record<GeneratedStampType, string> = {
  Altar1x1: 'Hub (altar)',
  CircleFilled1x1: 'Hub (filled circle)',
  Circle1x1: 'Hub (circle)',
  Key1x1: 'Key',
  DoorLocked1x1: 'Locked door',
  DoorSecret1x1: 'Secret door',
  DoorConcealed1x1: 'Concealed door',
  'secret-door': 'Secret door symbol',
  Danger1x1: 'Hazard',
  Trap1x1: 'Trap',
  trap: 'Trap symbol',
  DoorFalse1x1: 'False door',
  Unknown1x1: 'Unknown feature',
  SquareFilled1x1: 'Filled square marker',
  DoorRevolve1way1x1: 'One-way revolving door',
  DoorRevolving1x1: 'Revolving door',
  Door1x1: 'Door',
  door: 'Door symbol',
  DoorDouble1x1: 'Double door',
  TrapdoorFloor1x1: 'Trap door',
  DoorPortcullis1x1: 'Portcullis',
  DoorMagic1x1: 'Magic door',
  LadderDown1x1: 'Ladder down',
  LadderUp1x1: 'Ladder up',
  Stairs1x1_01: 'Stairs',
  StairSpiralSquareDown1x1: 'Spiral stairs',
  Window1x1: 'Window',
  DoorArchway1x1: 'Archway',
  Curtain1x1: 'Curtain',
  TriangleArrowhead1x1: 'Monster',
  Chest1x1: 'Treasure',
}

const legendEntries = GENERATED_STAMP_TYPES.map(type => ({ type, label: generatedStampLabels[type] }))

export function MapLegend() {
  return (
    <details className="map-legend">
      <summary>Dungeon legend</summary>
      <div className="map-legend-panel" aria-label="Generated map symbols">
        <ul>
          <li>
            <span className="map-legend-descent" role="img" aria-label="Ascending steps or ramp">↑</span>
            <span>Dungeon entrance</span>
          </li>
          {legendEntries.map(({ type, label }) => (
            <li key={type}>
              <img src={STAMP_ASSET_MAP[type]} alt={label} />
              <span>{label}</span>
            </li>
          ))}
          <li>
            <span className="map-legend-water" aria-hidden="true" />
            <span>Flooded hallway</span>
          </li>
        </ul>
      </div>
    </details>
  )
}
