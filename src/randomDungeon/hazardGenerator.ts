import type { D6Random } from './random'

export interface HazardRecord {
  roll: string
  name: string
  description: string
}

const HAZARDS: Record<string, Omit<HazardRecord, 'roll'>> = {
  '11': { name: 'Thin Air', description: 'Lack of O2 or high altitude makes breathing hard. Moving and attacking twice requires DC 9 CON or the creature is dazed for 1d4 rounds.' },
  '12': { name: 'Flooded', description: 'Water floods this room at foot, knee, waist, or head height. Movement is slowed, and the floor is obscured.' },
  '13': { name: 'Silence', description: 'The room dampens all sound.' },
  '14': { name: 'Quicksand', description: 'The section or entire floor is quicksand, mud, or tar. Movement is slowed. Creatures who do not move on their turn become trapped. DC 12 STR to escape.' },
  '15': { name: 'Thorns', description: 'The section or whole room is snarled with thorny growths. Take an action to cut a path or take 1d6 damage a round.' },
  '16': { name: 'Icy/Slimy', description: 'Movement is slowed. A double move requires DC 12 DEX or the creature falls prone.' },
  '21': { name: 'Thin Ice', description: 'Thin ice covers water. There is a 1-in-6 chance each round that the ice breaks.' },
  '22': { name: 'Vantage Point', description: 'A raised point overlooks this room.' },
  '23': { name: 'Fog', description: 'Sight is obscured beyond close range.' },
  '24': { name: 'Vermin', description: 'Ravenous vermin infest the area. Creatures outside torchlight take 1d4 damage per round.' },
  '25': { name: 'Cliff', description: 'One side of the room opens onto a fatally tall cliff.' },
  '26': { name: 'Rockslide', description: 'Unstable rocks can fall in the room. DC 12 DEX or take 3d6 damage.' },
  '31': { name: 'Brown Mold', description: 'Brown mold saps heat. If the torch is extinguished, everyone takes 1d6 cold damage per round.' },
  '32': { name: 'Ichor', description: 'Ichor coats objects or drips from the ceiling. It burns for 1d4 damage per round or destroys equipment.' },
  '33': { name: 'Extreme Heat/Cold', description: 'The room is sweltering or freezing. DC 9 CON or a creature can only move or act on a turn.' },
  '34': { name: 'Doors Stuck', description: 'The doors require DC 12 STR to open.' },
  '35': { name: 'High Winds', description: 'Ranged attacks are made at DISADV. DC 9 DEX or a torch is blown out.' },
  '36': { name: 'Barricaded Door', description: 'It takes 1d4 crawling rounds to clear the door.' },
  '41': { name: 'Cursed', description: 'Light is dim, and priest spellcasting checks are made at DISADV.' },
  '42': { name: 'Thick Vegetation', description: 'Vegetation obscures sightlines beyond close range.' },
  '43': { name: 'Webs', description: 'DC 12 STR to move through or become stuck. The webs can be cut or burned down.' },
  '44': { name: 'Debris', description: 'Movement is slowed.' },
  '45': { name: 'Crumbling Ground', description: 'There is a 1-in-6 chance the ground crumbles into the pit or room below.' },
  '46': { name: 'Magma/Acid', description: 'Pools of scorching magma or caustic acid fill the area. Falling in is fatal.' },
  '51': { name: 'Confusing Reflections', description: 'Surfaces reflect in a funhouse style. DC 9 WIS or a creature targets a reflection in combat.' },
  '53': { name: 'Strongroom', description: 'A vault in the room is enclosed by bars and a portcullis. The portcullis can be raised or dropped while inside.' },
  '54': { name: 'Sigil of Power', description: 'While standing inside, spellcasting checks have ADV.' },
  '55': { name: 'Ballista', description: 'A swivelling ballista is loaded with an action. Attacks with DEX deal 3d6 damage to creatures in a line.' },
  '56': { name: 'Shrine', description: 'Pray to absorb latent power for five rounds. The shrine becomes inert after.' },
  '61': { name: 'Fortifications', description: 'The area has wooden barricades. Those inside have cover.' },
  '62': { name: 'Gate', description: 'A chasm splits the room, with one drawbridge or gate. It can be closed or raised from one side.' },
  '63': { name: 'Magnetic Field', description: 'DC 12 STR or metal objects are attracted to the lode.' },
  '64': { name: 'Smell', description: 'DC 9 CON or lose a turn to retching.' },
  '65': { name: 'Gravity', description: 'Gravity is altered in the area.' },
  '66': { name: 'Disorienting Sound', description: 'Checks are made at DISADV. It is very difficult to hear.' },
}

const BARREL_CONTENTS = [
  { name: 'Blackpowder', description: 'Roll DEX or take 3d6 damage.' },
  { name: 'Trueice', description: 'Roll STR or freeze until struck.' },
  { name: 'Oil', description: 'Roll DEX or become ignited, taking 1d6 damage per round.' },
  { name: 'Bottled Storm', description: 'Roll CON or take 1d6 damage and become stunned until ENT.' },
  { name: 'Plague Barrels', description: 'Roll CON or reduce HP by half.' },
  { name: 'Soul Reliquaries', description: 'Roll WIS or take double damage for 1d4 rounds.' },
] as const

function d66(random: D6Random): string {
  return `${random.nextD6()}${random.nextD6()}`
}

export function createHazardRecord(random: D6Random): HazardRecord {
  const roll = d66(random)
  if (roll === '52') {
    const contents = BARREL_CONTENTS[random.nextD6() - 1]!
    return { roll: '52', name: `Exploding Barrels: ${contents.name}`, description: `A set of barrels or pottery explodes when struck. ${contents.description}` }
  }
  const hazard = HAZARDS[roll]
  if (!hazard) return createHazardRecord(random)
  return { roll, ...hazard }
}

export function formatHazardRecord(record: HazardRecord): string {
  return `Hazard: ${record.name}. ${record.description}`
}
