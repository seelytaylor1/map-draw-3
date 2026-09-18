import { STAMP_ASSET_MAP, type StampType } from './stamps'

const legendEntries: Array<{ type: StampType; label: string }> = [
  { type: 'Altar1x1', label: 'Hub' },
  { type: 'Key1x1', label: 'Key' },
  { type: 'DoorLocked1x1', label: 'Locked door' },
  { type: 'TriangleArrowhead1x1', label: 'Monster' },
  { type: 'Trap1x1', label: 'Trap' },
  { type: 'Chest1x1', label: 'Treasure' },
  { type: 'Danger1x1', label: 'Hazard' },
  { type: 'Door1x1', label: 'Door' },
  { type: 'DoorDouble1x1', label: 'Double door' },
  { type: 'DoorPortcullis1x1', label: 'Portcullis' },
  { type: 'TrapdoorFloor1x1', label: 'Trap door' },
  { type: 'DoorRevolving1x1', label: 'Revolving door' },
  { type: 'DoorSecret1x1', label: 'Secret door' },
  { type: 'DoorMagic1x1', label: 'Magic door' },
  { type: 'LadderDown1x1', label: 'Ladder down' },
  { type: 'LadderUp1x1', label: 'Ladder up' },
  { type: 'Stairs1x1_01', label: 'Stairs' },
  { type: 'StairSpiralSquareDown1x1', label: 'Spiral stairs' },
  { type: 'Window1x1', label: 'Window' },
  { type: 'DoorArchway1x1', label: 'Archway' },
  { type: 'Curtain1x1', label: 'Curtain' },
]

export function MapLegend() {
  return (
    <details className="map-legend">
      <summary>Dungeon legend</summary>
      <div className="map-legend-panel" aria-label="Generated map symbols">
        <ul>
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
