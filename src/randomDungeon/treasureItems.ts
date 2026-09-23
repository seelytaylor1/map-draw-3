import type { D6Random } from './random'
import { getTreasureMagicItemsForSources } from './magicItemSources'
import type { MagicItemRecord, TreasureItem } from './missionTypes'

export type TreasureQuality = 'pathetic' | 'poor' | 'fine' | 'masterwork'

type TreasureKind = 'coins' | 'gear' | 'luxury' | 'gems' | 'weaponArmor' | 'scroll' | 'potion' | 'wand' | 'magicItem' | 'cursedItem'
interface TreasureRow {
  range: readonly [number, number]
  kind: TreasureKind
  value: readonly [number, number]
  quality?: TreasureQuality
  mutated?: boolean
}

const row = (range: readonly [number, number], kind: TreasureKind, value: number | readonly [number, number], quality?: TreasureQuality, mutated = false): TreasureRow => ({
  range,
  kind,
  value: typeof value === 'number' ? [value, value] as const : value,
  ...(quality ? { quality } : {}),
  ...(mutated ? { mutated } : {}),
})

const TABLES: Record<string, readonly TreasureRow[]> = {
  '0-3': [
    row([1, 7], 'coins', [0, 0]), row([8, 11], 'coins', [0, 0]), row([12, 15], 'coins', [1, 6]), row([16, 19], 'coins', [1, 8]),
    row([20, 25], 'gear', 10, 'pathetic'), row([26, 31], 'luxury', 10, 'pathetic'), row([32, 37], 'coins', [11, 14]),
    row([38, 43], 'gear', 15, 'poor'), row([44, 49], 'luxury', 20, 'poor'), row([50, 55], 'gems', 20, 'pathetic'),
    row([56, 61], 'coins', [20, 25]), row([62, 67], 'weaponArmor', [25, 30]), row([68, 73], 'gems', [31, 34], 'poor'),
    row([74, 79], 'luxury', 45), row([80, 83], 'weaponArmor', 60, 'fine'), row([84, 87], 'gems', 70),
    row([88, 91], 'scroll', 80, 'poor', true), row([92, 95], 'potion', 100, 'poor', true),
    row([96, 97], 'cursedItem', 150), row([98, 99], 'magicItem', 150, 'poor'),
  ],
  '4-6': [
    row([1, 6], 'coins', [0, 0]), row([7, 11], 'coins', [0, 0]), row([12, 15], 'coins', [3, 18]), row([16, 19], 'coins', [4, 24]),
    row([20, 24], 'gear', 25), row([25, 29], 'luxury', 25), row([30, 34], 'coins', [32, 42]), row([35, 39], 'gems', [31, 34], 'poor'),
    row([40, 44], 'weaponArmor', 40), row([45, 49], 'luxury', 45), row([50, 54], 'coins', [51, 56]),
    row([55, 59], 'gear', 55, 'fine'), row([60, 63], 'gems', 60), row([64, 67], 'weaponArmor', 65, 'fine'),
    row([68, 71], 'luxury', 70, 'masterwork'), row([72, 75], 'scroll', 80, 'poor', true), row([76, 79], 'gems', 80, 'fine'),
    row([80, 83], 'potion', 85, 'pathetic', true), row([84, 85], 'scroll', 100, undefined, true),
    row([86, 87], 'potion', 100, 'poor', true), row([88, 89], 'wand', 150), row([90, 91], 'magicItem', 150, 'poor'),
    row([94, 95], 'magicItem', 200), row([98, 99], 'magicItem', 300, 'fine'),
  ],
  '7-9': [
    row([1, 1], 'coins', [0, 0]), row([2, 5], 'coins', [0, 0]), row([6, 11], 'luxury', [16, 21], 'pathetic'),
    row([12, 17], 'gear', 25), row([18, 23], 'luxury', 40, 'fine'), row([24, 27], 'weaponArmor', 75, 'fine'),
    row([28, 31], 'luxury', 75, 'fine'), row([32, 37], 'gems', 70, 'fine'), row([38, 41], 'coins', [76, 81]),
    row([42, 49], 'luxury', 80, 'masterwork'), row([50, 55], 'gear', 85, 'fine'), row([56, 61], 'coins', [91, 96]),
    row([62, 65], 'gems', 95, 'fine'), row([66, 73], 'magicItem', [110, 120], 'poor'),
    row([74, 75], 'potion', 150, undefined, true), row([76, 77], 'potion', 200, undefined, true),
    row([78, 79], 'magicItem', 250), row([80, 81], 'scroll', 260, undefined, true), row([82, 83], 'magicItem', 260),
    row([84, 85], 'gear', 320, 'masterwork'), row([86, 87], 'magicItem', 300, 'fine'),
    row([92, 93], 'magicItem', 350, 'masterwork'), row([94, 97], 'gems', 350, 'masterwork'),
  ],
  '10+': [
    row([1, 4], 'coins', [0, 0]), row([5, 8], 'coins', [0, 0]), row([9, 12], 'coins', [104, 140]),
    row([13, 16], 'gems', 80, 'poor'), row([17, 20], 'gems', 150, 'fine'), row([21, 24], 'gems', 320, 'masterwork'),
    row([25, 28], 'gear', 100), row([29, 32], 'gear', 150, 'fine'), row([33, 36], 'gear', 250, 'masterwork'),
    row([37, 40], 'weaponArmor', 100), row([41, 44], 'weaponArmor', 150, 'fine'), row([45, 48], 'weaponArmor', 250, 'masterwork'),
    row([49, 56], 'scroll', 100, 'fine', true), row([57, 60], 'scroll', 250, 'masterwork'), row([61, 64], 'potion', 100, 'fine', true),
    row([65, 72], 'luxury', [154, 190], 'masterwork'), row([73, 76], 'magicItem', 200, 'fine'),
    row([77, 84], 'magicItem', 350, 'masterwork'), row([89, 92], 'magicItem', 600, 'masterwork'),
    row([96, 98], 'gems', 900, 'masterwork'),
  ],
}

const QUALITY_WORDS: Record<TreasureQuality, readonly string[]> = {
  pathetic: ['Shattered', 'Riddled', 'Brittle', 'Faded', 'Warped', 'Worn smooth', 'Limp', 'Crumbling', 'Splintered', 'Loose', 'Corroded', 'Weatherworn', 'Deformed', 'Hollow', 'Peeling', 'Scratched', 'Slag', 'Incinerated', 'Forgery', 'Primeval'],
  poor: ['Cracked', 'Rusted', 'Stained', 'Twisted', 'Worn', 'Sagging', 'Soft', 'Chipped', 'Tarnished', 'Bent', 'Fragile', 'Flaking', 'Dull', 'Scuffed', 'Melted', 'Burnt', 'Replica', 'Crude', 'Sloppy', 'Old'],
  fine: ['Unblemished', 'Beautiful', 'Balanced', 'Exceptional', 'Dense', 'Intricate', 'Delicate', 'Refined', 'Rugged', 'Dazzling', 'Elegant', 'Engraved', 'Filigreed', 'Coated', 'Superior', 'Robust', 'Fascinating', 'Unique', 'Precious', 'Antique'],
  masterwork: ['Flawless', 'Opus', 'Indestructible', 'One of a kind', 'Weightless', 'Mythic', 'Famous', 'Exquisite', 'Unrivaled', 'Masterpiece', 'Impeccable', 'Pinnacle', 'Genius', 'Enchanting', 'Mint', 'Confounding', 'Historical', 'Timeless', 'Peerless', 'Revolutionary'],
}

const GEMS: readonly [string, number][] = [
  ['red-brown jasper', 5], ['mottled gray agate', 10], ['translucent amber', 20], ['glassy yellow citrine', 25], ['milky white quartz', 30],
  ['blue, gold-flecked lapis lazuli', 35], ['lime-green peridot', 40], ['greenish-blue turquoise', 45], ['purple amethyst', 50], ['deep-red garnet', 60],
  ['amber topaz', 70], ['rainbow-sheened opal', 80], ['pale sea-blue aquamarine', 90], ['pink spinel', 100], ['pearl', 120], ['green jade', 160],
  ['vibrant-blue sapphire', 200], ['deep-green emerald', 25], ['crimson ruby', 300], ['brilliant crystal-clear diamond', 360],
]
const COIN_LOCATIONS = ['found at the bottom of an empty chest', 'clutched in a corpse’s hand', 'scattered across the floor', 'hidden inside a dry gourd', 'buried in a coffin, sarcophagus, or burial niche', 'stuffed into a loose boot', 'tucked into a belt pouch', 'hidden inside a skull', 'packed into a torn backpack', 'stored in a wicker basket', 'buried in the wreckage of a crate', 'stashed inside a sack', 'hidden in a corpse’s pocket', 'stored in a wooden box', 'placed inside a ceramic cup', 'hidden inside a hollow stone idol', 'locked inside a blackened iron coffer', 'suspended in amber', 'stored inside an iron-bound chest', 'stored in a golden coffer']
const COIN_TYPES = ['ancient-minted', 'local', 'distant-land', 'Shadowdark-culture']

const GEAR = ['arrows (1d20)', 'backpack', 'bag of caltrops', 'crossbow bolts (1d20)', 'crowbar', 'flask', 'bottle', 'flint and steel', 'grappling hook', 'iron spikes (1d10)', 'lantern (1d3×10 minutes remain)', 'mirror', 'flask of oil', 'pole', 'rations (d3)', '60-foot rope', 'torch (30 minutes remain)', 'hollow arrows (1d10)', 'rope arrows (1d10)', 'smoke pellets (1d10)', 'bag of ball bearings', 'listening cone', 'spectacle mask', 'portable ram', 'manacles (50% chance of key)', 'glider', 'censer', 'hand drill', 'cat stink', 'cold-weather gear', 'signal whistle', 'magnet', 'rubber balls (1d10)', 'rubbing kit', 'firepowder', 'plague doctor mask', 'whetstone', 'sledgehammer', 'tent', 'earplugs', 'quill and ink', 'animal feed', 'chalk (1d3)', 'shovel', 'pickaxe', 'fishing rod', 'hourglass', 'bear trap', 'bell', 'waterskin', 'torch (1d3)', 'torch (1d6)']
const LUXURY: readonly (readonly string[])[] = [
  ['necklace', 'statuette', 'brooch', 'pendant', 'needle', 'spectacles'], ['painting', 'tapestry', 'sculpture', 'medallion', 'spoon', 'fork'],
  ['vase', 'goblet', 'dagger', 'mask', 'kettle', 'pot'], ['tiara', 'scepter', 'crown', 'throne', 'mug', 'bowl'], ['mirror', 'comb', 'fan', 'gloves', 'sack', 'wheel'],
  ['belt', 'boots', 'cloak', 'saddle', 'scissors', 'soap'], ['chess set', 'dice', 'playing cards', 'game board', 'pillow', 'robe'], ['sundial', 'astrolabe', 'compass', 'spyglass', 'mirror', 'slippers'],
  ['chalice', 'wine skin', 'amphora', 'pitcher', 'incense', 'tablet'], ['scroll', 'book', 'manuscript', 'map', 'brocade', 'handkerchief'], ['flute', 'drum', 'lyre', 'horn', 'harp', 'quiver'],
  ['lamp', 'candelabra', 'brazier', 'torch', 'carving', 'dye'], ['rug', 'carpet', 'tapestry', 'blanket', 'chair', 'table'], ['seal ring', 'signet', 'cameo', 'bracelet', 'cup', 'liquor'],
  ['quill', 'inkwell', 'writing desk', 'seal', 'body chain', 'manacles'], ['crest', 'shield', 'helmet', 'banner', 'cane', 'textile'], ['egg', 'box', 'chest', 'reliquary', 'veil', 'hourglass'],
  ['telescope', 'magnifying glass', 'amber', 'pelt', 'trophy'], ['horn', 'shell', 'feather', 'bone', 'crystal ball', 'bracer'], ['orb', 'cube', 'prism', 'pyramid', 'beads', 'lamp'],
]

const WEAPONS_ARMOR = ['bastard sword', 'club', 'crossbow', 'dagger', 'greataxe', 'greatsword', 'javelin', 'longbow', 'longsword', 'mace', 'shortbow', 'shortsword', 'spear', 'staff', 'warhammer', 'punching dagger', 'star hand', 'flail', 'sling', 'hand crossbow', 'ultra greatsword', 'swordaxe', 'mancatcher', 'throwing ring', 'boomerang', 'dwarven blunderbuss', 'dwarven firebomb', 'ironspike firebomb', 'tunnel pike', 'blastbolt crossbow', 'crankshot rifle', 'blowpipe and 1d10 darts', 'cat o’ nine tails', 'cirque', 'razor chain', 'razor club', 'war scythe', 'whip', 'hardlight blade', 'kinetic pistol', 'plasma rifle', 'grenade', 'tower shield', 'scale mail', 'full helm', 'ironclad', 'boltshield', 'blind mask', 'death mask', 'hardened leather', 'lantern shield', 'spiked armor', 'leather armor', 'chainmail', 'plate mail', 'shield (d6 style)', 'mithral armor']

const SPELLS: readonly (readonly string[])[] = [
  ['Acid Arrow', 'Alarm', 'Alter Self', 'Augury', 'Bless', 'Blind/Deafen', 'Burning Hands', 'Charm Person', 'Cleansing Weapon', 'Cure Wounds', 'Detect Magic', 'Mage Armor', 'Magic Missile', 'Mirror Image', 'Misty Step', 'Protection From Evil', 'Shield of Faith', 'Silence', 'Sleep', 'Smite', 'Summon Demon', 'Turn Undead'],
  ['Animate Dead', 'Arcane Eye', 'Cloudkill', 'Command', 'Commune', 'Confusion', 'Control Water', 'Dimension Door', 'Dispel Magic', 'Divination', 'Fabricate', 'Fireball', 'Flame Strike', 'Fly', 'Gaseous Form', 'Illusion', 'Lay to Rest', 'Magic Circle', 'Mass Cure', 'Passwall', 'Pillar of Salt', 'Polymorph', 'Protection From Energy', 'Rebuke Unholy', 'Regenerate', 'Resilient Sphere', 'Restoration', 'Sending', 'Speak With Dead', 'Stoneskin', 'Telekinesis', 'Wall of Force', 'Wrath'],
  ['Antimagic Shell', 'Create Undead', 'Disintegrate', 'Divine Vengeance', 'Dominion', 'Heal', 'Hold Monster', 'Judgment', 'Plane Shift', 'Power Word Kill', 'Prismatic Orb', 'Prophecy', 'Scrying', 'Shapechange', 'Summon Extraplanar', 'Teleport', 'Wish', 'Tolling to Empty All Graves', 'Castigate the Enemies of the Godhead', 'Shackles Fit For a Gilded Ape', 'Hunger of My Twinned Shadow', 'Why Do We Worship Your Husk, O’ Eclipsed King?', 'Revanchize The Untainted Throne', 'Three Red Seconds', 'The Time of the Sword', 'Apotheosis Of Eidetic Redaction'],
]

const SCROLL_MUTATIONS = ['A demon appears and casts the spell for you.', 'The scroll vanishes in a flash; the spell is added to your spell list.', 'Range drops one step and duration doubles.', 'The scroll burns, dealing 1d6 fire damage; the spell casts perfectly.', 'The spell effect is inverted.', 'A spectral voice narrates your life for an hour.', 'Your eyes glow ominously for 24 hours.', 'Everyone within 10 feet is knocked prone.', 'Casting costs 1 HP per spell tier.', 'You enter a fugue for 1d4 rounds; casting takes ten minutes.', 'The spell targets a random target.', 'The spell consumes all nearby light.', 'The scroll binds you from casting other spells until dispelled.', 'A terrible sound can be heard for miles.', 'A minor elemental forms to cast the spell.', 'The earth violently shakes.', 'You age 1d4 years.', 'The spell is illusory and fades in 1d4 rounds.', 'A flash blinds everyone in sight for 1d4 rounds.', 'Glowing embers illuminate the area for one round.', 'Damage spells deal an extra 1d6 per tier.', 'Gravity reverses nearby for 1d4 rounds.', 'The spell name changes by one letter; negotiate its new effect.', 'The target gains +4 STR for one hour.', 'The spell becomes an aura affecting nearby creatures for 1d4 hours.', 'The spell range doubles.', 'A brief storm or strange winds appear.', 'A minor earthquake affects the area for 1d4 rounds.', 'Your spellcasting checks have disadvantage for 1d4 rounds.', 'The spell takes twice as long to cast.', 'The spell must be shouted.', 'You gain a luck token.', 'You heal 1d6 HP per spell tier when casting.', 'If the spell rolls dice, roll twice and take the higher result.']

const POTIONS = ['Radiates heat; immune to cold.', 'Brief visions of past events in the local area.', 'Silences the drinker.', 'Fly into a rage: +1d4 damage and advantage on attacks.', 'Skin becomes bark; AC 15.', 'Advantage to spot.', 'After taking damage, heal d4 on the next round.', 'Immune to morale and fear.', 'Speak any language.', 'Breathe fire: 3d6 in a near cone.', 'Sense beings at double-near range.', 'Become lighter than air.', 'Deafening scream: 2d6 to all who hear.', 'Frost skin; immune to fire.', 'Move twice as fast and attack twice; take 1d4 temporary CON damage.', 'See through illusions and invisibility.', 'Sprout spines; grabbers take 1d8 and you have advantage to escape.', 'Appear as a viperian; AC 14.', 'Breathe water.', 'Heal 1d8 or 2d8.', 'Temporarily raise a stat to 18.', 'Heal 3d8 or 4d8.', 'Become invisible.', 'Become electrically charged; deal 1d8 on contact.', 'Laughter stuns listeners who fail a DC 12 INT check.', 'Transform into gas, ash, water, or ooze.', 'Obsidian skin; half speed and immune to damage.', 'Regrow lost limbs; heal 1d4 per round.', 'Throw black-flame balls for 2d8 damage.', 'Fall in love with someone.', 'Gain a luck token.', 'Restore 1d4 lost spells.', 'Restore lost spells, HP, and stats.', 'Gain 2d8 temporary HP.', 'Serves as a ration.', 'Heal 5d8 or 6d8.', 'Heal 7d8 or 8d8.', 'Heal 9d8 or 10d8.', 'Roll on the talent table.', 'Restore a slain ally to life.']
const POTION_MUTATIONS = ['Combines two potions.', 'Has the opposite effect.', 'Lasts twice as long.', 'Twice as effective.', 'Half as effective.', 'Lasts half as long.', 'Affects nearby allies.', 'Takes 1d4 rounds to activate.', 'Causes side effects; roll another effect at the end.', 'Disgusting: DC 12 CON or waste it.']
const CONTAINERS = ['clay vial', 'wax-sealed glass phial', 'corked bottle', 'bone vial', 'silver flask', 'clay jar', 'wooden cask', 'leather skin', 'delicate crystal decanter', 'gem vial']
const COLORS = ['blue', 'black', 'clear and shimmering', 'golden', 'pink and bubbling', 'red', 'green', 'clear and smoking', 'clear and sparkling', 'black with streaks']

const CURSES = ['Wails when its former owner’s death occurred: drowned, trapped, undead, or nobles.', 'Powered by a trapped magical being.', 'Absorbs the first luck you receive each day.', 'Forces you to reveal secrets without thinking.', 'Functions only for one very specific purpose.', 'Functions only for you.', 'Changes shape to resemble other items in your bag.', 'Craves cheese, aged meat, nuts, or pickled fish; becomes inert without it for 24 hours.', 'Ceases functioning when wet.', 'Sized for a giant and occupies one extra slot.', 'Takes twice as long to activate.', 'Hums because it wants to be a musical instrument.', 'Obsessed with finding flattering reflections.', 'Insists that it is cursed.', 'On draw, 1-in-6 chance it forces an attack on the nearest creature.', 'If you lie while holding it, your voice echoes unnaturally.', 'You have vivid nightmares if you sleep in the same place two nights in a row.', 'Grows heavier with each foe it slays that day; resets at dawn.', 'Each critical hit plays a note; after 1d20 notes something wakes.', 'If you fall to 0 HP while carrying it, you rise undead at dawn unless a holy ritual is performed.', 'Once per day teleports to a random dungeon location.', 'You can speak only an ancient dead language while holding it.', 'Takes 1d4 rounds to find in your pack or sheath.', 'Becomes inert if you do not eat a full meal every 24 hours.', 'Fragile: 1-in-6 chance to break on each use.', 'Foliage clings to you and halves your speed.', 'Attracts spiders and snakes during rests.', 'Weakens you; using it deals 1 Strength damage.', 'Glues itself to your body when worn or wielded.', 'Emits cacophonous laughter while worn or wielded.', 'Was part of a monster; use deals 1 Charisma damage.', 'Each use costs 1d4 HP that cannot heal until dawn.', 'Demands a self-inflicted 1d6 blood sacrifice per use.', 'Your footsteps echo and alert enemies.', 'Functions only for your bloodline.', 'Houses an alien entity that calls to other void beings.', 'Blinds you while wielded.', 'You cannot gain luck tokens.', 'You forget everything that happened while using it.', 'Attracts your attention; disadvantage to notice things.', 'At dawn, 1-in-6 chance to become a lead coin until dusk.', 'You must speak in rhyme while using it.', 'You periodically make animal noises, even when silent.', 'Your feet or boots become invisible.', 'You laugh uncontrollably whenever about to act.', 'Each use grows your hair one inch.', 'Absorbs souls; after five, drains 1 WIS.', 'You are very hard to awaken.', 'Your body loses its sense of touch over 1d4 days.', 'Spirits of those killed with it haunt you.', 'The player must put their sheet on the floor.']

function rollInclusive(random: Pick<D6Random, 'nextD6'>, minimum: number, maximum: number): number {
  const range = maximum - minimum + 1
  if (range <= 1) return minimum
  let space = 1
  let dice = 0
  while (space < range) { space *= 6; dice += 1 }
  const limit = space - (space % range)
  let value = 0
  do {
    value = 0
    for (let index = 0; index < dice; index += 1) value = value * 6 + random.nextD6() - 1
  } while (value >= limit)
  return minimum + value % range
}

interface Candidate { row: TreasureRow; valueGp: number; gem?: string; weight: number }

function gemsForValue(valueGp: number): string | undefined {
  let remaining = valueGp
  const stones: string[] = []
  const sortedGems = [...GEMS].sort((left, right) => right[1] - left[1])
  while (remaining > 0) {
    const stone = sortedGems.find(([, worth]) => worth <= remaining)
    if (!stone) return undefined
    stones.push(stone[0])
    remaining -= stone[1]
  }
  return stones.join(' + ')
}

function candidatesFor(rows: readonly TreasureRow[], targetGp: number, remainingGp: number): Candidate[] {
  const candidates: Candidate[] = []
  for (const treasureRow of rows) {
    const [minimum, maximum] = treasureRow.value
    if (maximum === 0) continue
    const weight = treasureRow.range[1] - treasureRow.range[0] + 1
    if (treasureRow.kind === 'gems') {
      if (minimum >= 500) {
        if (minimum <= targetGp && targetGp - minimum <= 3 && minimum <= remainingGp) {
          candidates.push({ row: treasureRow, valueGp: minimum, gem: 'a cluster of giant gems', weight })
        }
        continue
      }
      for (let valueGp = Math.max(minimum - 3, targetGp - 3); valueGp <= Math.min(maximum + 3, targetGp, remainingGp); valueGp += 1) {
        const gem = valueGp % 5 === 0 ? gemsForValue(valueGp) : undefined
        if (gem && valueGp >= 1) {
          candidates.push({ row: treasureRow, valueGp, gem, weight })
        }
      }
      continue
    }
    const start = Math.max(minimum, targetGp - 3)
    const end = Math.min(maximum, targetGp, remainingGp)
    for (let valueGp = start; valueGp <= end; valueGp += 1) {
      if (valueGp >= 1 && targetGp - valueGp <= 3) candidates.push({ row: treasureRow, valueGp, weight })
    }
  }
  return candidates
}

function pickCandidate(random: Pick<D6Random, 'nextD6'>, candidates: readonly Candidate[]): Candidate | undefined {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  if (total === 0) return undefined
  let selected = rollInclusive(random, 1, total)
  for (const candidate of candidates) {
    selected -= candidate.weight
    if (selected <= 0) return candidate
  }
  return candidates[candidates.length - 1]
}

function pick<T>(random: Pick<D6Random, 'nextD6'>, items: readonly T[]): T {
  return items[rollInclusive(random, 0, items.length - 1)]!
}

function qualityFor(random: Pick<D6Random, 'nextD6'>, grade?: TreasureQuality): { grade: TreasureQuality; word: string } {
  const quality = grade ?? pick(random, ['pathetic', 'poor', 'fine', 'masterwork'] as const)
  return { grade: quality, word: pick(random, QUALITY_WORDS[quality]) }
}

function qualityAdjective(word: string): string {
  switch (word) {
    case 'Forgery': return 'forged'
    case 'Replica': return 'replica'
    case 'Opus': return 'opus-quality'
    case 'One of a kind': return 'one-of-a-kind'
    case 'Masterpiece': return 'masterpiece-grade'
    case 'Pinnacle': return 'pinnacle-quality'
    case 'Genius': return 'genius-crafted'
    default: return word.toLowerCase()
  }
}

function articleFor(phrase: string): 'a' | 'an' {
  return /^(?:one|unique|historical)\b/i.test(phrase) || !/^[aeiou]/i.test(phrase) ? 'a' : 'an'
}

function coinLocationDetail(random: Pick<D6Random, 'nextD6'>, coinType: string, valueGp: number, small = false): string {
  const selectedLocation = pick(random, COIN_LOCATIONS)
  const usesGoldenCoffer = selectedLocation === 'stored in a golden coffer'
  const location = usesGoldenCoffer && valueGp < 25 ? 'stored in a wooden box' : selectedLocation
  const prefix = small ? 'A small cache' : 'A cache'
  if (usesGoldenCoffer && valueGp >= 25) {
    return `${prefix} of ${coinType} coins, stored in a golden coffer worth 25 gp; that value is included in this find.`
  }
  return `${prefix} of ${coinType} coins, ${location}.`
}

function spellLevelIndex(levelLabel: string): number {
  return levelLabel === '0-3' ? 0 : levelLabel === '4-6' ? 1 : 2
}

function itemDescription(
  random: Pick<D6Random, 'nextD6'>,
  candidate: Candidate,
  levelLabel: string,
  sources: readonly MagicItemRecord[],
): TreasureItem {
  const { row: treasureRow, valueGp, gem } = candidate
  const quality = qualityFor(random, treasureRow.quality)
  const descriptor = qualityAdjective(quality.word)
  let baseName = ''
  let detail = ''
  switch (treasureRow.kind) {
    case 'coins': {
      const mintRoll = rollInclusive(random, 1, 20)
      const coinType = mintRoll <= 12 ? COIN_TYPES[0] : mintRoll <= 15 ? COIN_TYPES[1] : mintRoll <= 18 ? COIN_TYPES[2] : COIN_TYPES[3]
      baseName = `${valueGp} gp in ${coinType} coins`
      detail = coinLocationDetail(random, coinType, valueGp)
      break
    }
    case 'gear': baseName = pick(random, GEAR); detail = `Found as ${articleFor(descriptor)} ${descriptor} piece of dungeon gear.`; break
    case 'luxury': {
      const group = rollInclusive(random, 1, 20) - 1
      baseName = pick(random, LUXURY[group]!)
      detail = `${articleFor(descriptor)} ${descriptor} luxury piece of ${pick(random, ['Thanian', 'Kytherian', 'Aslainian', 'Infernal', 'Gloaming', 'Morzomothian', 'Andrikian', 'Montmarian', 'Old One', 'Mythic', 'Djurum', 'Reaches', 'Fey', 'Demonic', 'Sci-fi', 'Itzalca'])} origin.`
      break
    }
    case 'gems': baseName = gem ?? 'gemstone'; detail = gem === 'a cluster of giant gems'
      ? `A cache of oversized stones, each worked to ${articleFor(descriptor)} ${descriptor} finish.`
      : gem?.includes(' + ')
        ? `A matched set of ${descriptor} cut stones.`
        : `${articleFor(descriptor)} ${descriptor} cut stone.`; break
    case 'weaponArmor': baseName = pick(random, WEAPONS_ARMOR); detail = `${articleFor(descriptor)} ${descriptor} piece of equipment.`; break
    case 'scroll': {
      baseName = `scroll of ${pick(random, SPELLS[spellLevelIndex(levelLabel)]!)}`
      const mutation = treasureRow.mutated && random.nextD6() <= 3 ? ` Mutation: ${pick(random, SCROLL_MUTATIONS)}` : ''
      detail = `Script quality: ${quality.word}.${mutation}`
      break
    }
    case 'potion': {
      baseName = `potion: ${pick(random, POTIONS)}`
      const mutation = treasureRow.mutated && random.nextD6() <= 3 ? ` Mutation: ${pick(random, POTION_MUTATIONS)}` : ''
      detail = `A ${pick(random, COLORS)} potion in a ${pick(random, CONTAINERS)}.${mutation}`
      break
    }
    case 'wand': {
      const wands = sources.filter(item => /\bwand\b/i.test(item.name))
      const wand = wands.length > 0 ? pick(random, wands) : undefined
      baseName = wand?.name ?? 'wand of sparks'
      detail = wand?.description ?? 'A carved wand with a faint magical glow.'
      break
    }
    case 'magicItem': {
      const magicItem = sources.length > 0 ? pick(random, sources) : undefined
      baseName = magicItem?.name ?? 'enchanted keepsake'
      detail = magicItem?.description ?? 'A small object with a persistent magical aura.'
      break
    }
    case 'cursedItem': {
      const magicItem = sources.length > 0 ? pick(random, sources) : undefined
      baseName = magicItem?.name ?? 'enchanted keepsake'
      detail = `${magicItem?.description ?? 'A small object with a persistent magical aura.'} Curse: ${pick(random, CURSES)}`
      break
    }
  }
  return { name: `${descriptor[0]!.toUpperCase()}${descriptor.slice(1)} ${baseName}`, detail, valueGp }
}

export function generateTreasureItem(
  random: Pick<D6Random, 'nextD6'>,
  levelLabel: string,
  targetGp: number,
  remainingGp: number,
  sourceIds: Parameters<typeof getTreasureMagicItemsForSources>[0],
): TreasureItem {
  const rows = TABLES[levelLabel] ?? TABLES['0-3']!
  const sources = getTreasureMagicItemsForSources(sourceIds)
  const candidates = candidatesFor(rows, targetGp, remainingGp)
  const selected = pickCandidate(random, candidates)
  if (selected) return itemDescription(random, selected, levelLabel, sources)

  const fallback: Candidate = { row: row([1, 100], 'coins', targetGp), valueGp: Math.min(targetGp, remainingGp), weight: 1 }
  const quality = qualityFor(random)
  const descriptor = qualityAdjective(quality.word)
  const coinType = pick(random, COIN_TYPES)
  return {
    name: `${descriptor[0]!.toUpperCase()}${descriptor.slice(1)} ${fallback.valueGp} gp in coins`,
    detail: coinLocationDetail(random, coinType, fallback.valueGp, true),
    valueGp: fallback.valueGp,
  }
}
