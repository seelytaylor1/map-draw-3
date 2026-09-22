// THROWAWAY LOGIC PROTOTYPE
//
// Question: for the same semantic loop graph, which placement model feels more
// useful for Torch & Tile—explicit readable lanes or flexible global packing?

import readline from 'node:readline'
import { createPlan, LOOP_NAMES, type LoopType } from './shared.ts'
import { layoutLanes } from './lane-layout.ts'
import { layoutPacked } from './packed-layout.ts'

type State = { seed: number; loopType: LoopType }
const state: State = { seed: 424242, loopType: 3 }

function bold(value: string) { return `\x1b[1m${value}\x1b[0m` }
function dim(value: string) { return `\x1b[2m${value}\x1b[0m` }

function printPrototype(result: ReturnType<typeof layoutLanes>) {
  console.log(`${bold(result.prototype)}  ${dim(`rooms=${result.stats.rooms} relations=${result.stats.relations} cycles=${result.stats.cycles} routed=${result.stats.routed}`)}`)
  console.log(`Goal: ${result.plan.goalKind}`)
  console.log(result.map.join('\n'))
  console.log('Legend: S start  G goal  K key  H lake  - open  = lock  : secret  ~ valve  + return')
  if (result.failures.length) console.log(`Failures: ${result.failures.join('; ')}`)
  else console.log(dim('Failures: none'))
}

function render() {
  console.clear()
  const plan = createPlan(state.loopType, state.seed)
  const lanes = layoutLanes(plan)
  const packed = layoutPacked(plan, state.seed)
  console.log(bold('ROOM-GRAPH PLACEMENT PROTOTYPES'))
  console.log(`Loop: ${bold(`${state.loopType} — ${LOOP_NAMES[state.loopType]}`)}    Seed: ${bold(String(state.seed))}`)
  console.log(dim('Both prototypes receive the exact same semantic rooms and relations.'))
  console.log('')
  printPrototype(lanes)
  console.log('')
  printPrototype(packed)
  console.log('')
  console.log(`${bold('Commands')}  ${dim('[1-6] loop type   [n] next seed   [s 123] set seed   [q] quit')}`)
}

function handle(input: string) {
  const command = input.trim().toLowerCase()
  if (command === 'q' || command === 'quit') return false
  if (/^[1-6]$/.test(command)) state.loopType = Number(command) as LoopType
  else if (command === 'n' || command === 'next') state.seed = (state.seed + 1) >>> 0
  else if (command.startsWith('s ')) {
    const parsed = Number(command.slice(2).trim())
    if (Number.isFinite(parsed)) state.seed = parsed >>> 0
  }
  return true
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function loop() {
  render()
  rl.question('> ', (answer) => {
    if (!handle(answer)) {
      rl.close()
      return
    }
    loop()
  })
}

loop()
