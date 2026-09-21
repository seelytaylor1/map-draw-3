import type { D6Random } from './random'
import type { DungeonLevelBudget } from './monsterBudget'
export interface MonsterRecord {
  name: string
  flavor: string
  level: string | number
}
export const MONSTER_CATALOG: readonly MonsterRecord[] = [
  {
    "name": "Aboleth",
    "flavor": "Enormous, antediluvian catfish covered in slime and tentacles. They hate all intelligent beings.",
    "level": 8
  },
  {
    "name": "Acolyte",
    "flavor": "A religious trainee who knows basic rites and rituals.",
    "level": 1
  },
  {
    "name": "Angel, Archangel",
    "flavor": "A radiant being with a Imperial of fire, snowy wings, golden armor, and a blazing greatsword.",
    "level": 16
  },
  {
    "name": "Angel, Domini",
    "flavor": "Winged, flawless humans glowing with bronze sunlight.",
    "level": 9
  },
  {
    "name": "Angel, Principi",
    "flavor": "Serene humans sculpted from alabaster. Golden orbs for eyes.",
    "level": 11
  },
  {
    "name": "Angel, Seraph",
    "flavor": "Beautiful, luminous humanoids with white-feathered wings.",
    "level": 3
  },
  {
    "name": "Animated Armor",
    "flavor": "An old suit of armor magically animated by a",
    "level": 2
  },
  {
    "name": "Ankheg",
    "flavor": "Horse-sized, rust-brown insects. They burrow vast, underground warrens into the bedrock.",
    "level": 3
  },
  {
    "name": "Ape",
    "flavor": "Hooting, omnivorous apes that live in trees.",
    "level": 2
  },
  {
    "name": "Ape, Snow",
    "flavor": "White-haired, carnivorous gorillas that stalk",
    "level": 4
  },
  {
    "name": "Apprentice",
    "flavor": "A cloaked magician with a thin, freshly bound",
    "level": 1
  },
  {
    "name": "Archmage",
    "flavor": "A wizened magic-user crackling with arcane power.",
    "level": 10
  },
  {
    "name": "Assassin",
    "flavor": "A black-cloaked, skulking killer.",
    "level": 8
  },
  {
    "name": "Azer",
    "flavor": "Dwarves with bronze, metallic skin and flames for hair.",
    "level": 3
  },
  {
    "name": "Badger",
    "flavor": "Fierce, clawed burrowers with black-and-white face stripes",
    "level": 1
  },
  {
    "name": "Bandit",
    "flavor": "Hard-bitten rogue in tattered leathers and a hooded cloak.",
    "level": 1
  },
  {
    "name": "Basilisk",
    "flavor": "Massive, muscled lizards with six legs and gray, tough hide.",
    "level": 5
  },
  {
    "name": "Bat, Giant",
    "flavor": "Leathery, eagle-sized mammal with a taste for flesh.",
    "level": 2
  },
  {
    "name": "Bat, Swarm",
    "flavor": "A whirling cloud of screeching, bloodthirsty bats.",
    "level": 4
  },
  {
    "name": "Bear, Brown",
    "flavor": "A hulking, swaying brute with claws as long as a finger.",
    "level": 5
  },
  {
    "name": "Bear, Polar",
    "flavor": "A mighty, white bear that thrives in arctic environments.",
    "level": 7
  },
  {
    "name": "Beastman",
    "flavor": "A cave hominid with scraggly fur and a stone-tipped spear.",
    "level": 1
  },
  {
    "name": "Berserker",
    "flavor": "Howling, battleraging warriors.",
    "level": 2
  },
  {
    "name": "Black Pudding",
    "flavor": "A black, ice-cold mass of sludge.",
    "level": 6
  },
  {
    "name": "Boar",
    "flavor": "Ornery wild pig with bristly, russet hair and yellowed tusks.",
    "level": 3
  },
  {
    "name": "Brain Eater",
    "flavor": "Purple, gaunt humanoids with squidlike heads and four face tentacles.",
    "level": 8
  },
  {
    "name": "Bugbear",
    "flavor": "Brutish, bat-eared goblinoids covered in brown fur.",
    "level": 3
  },
  {
    "name": "Bulette",
    "flavor": "A hulking, shark-sized lizard with a steely, arrow-shaped carapace and a massive gullet.",
    "level": 8
  },
  {
    "name": "Camel",
    "flavor": "Ornery, tan-furred desert beasts.",
    "level": 2
  },
  {
    "name": "Cave Brute",
    "flavor": "Clawed apes with sandy, matted hair and reflective eyes. Carnivorous ambush hunters.",
    "level": 6
  },
  {
    "name": "Cave Creeper",
    "flavor": "A hulking, insectoid beast with\r\nlong mandibles, four eyes, and\r\nthick arms covered in bristles.",
    "level": 4
  },
  {
    "name": "Centaur",
    "flavor": "Chittering, green centipedes the\r\nsize of horses. Their grasping\r\ntentacles are coated in a\r\nparalytic venom.",
    "level": 3
  },
  {
    "name": "Centipede, Giant",
    "flavor": "Blood-red, feathery centipedes the size of a human arm. Their bite injects a burning poison that cramps muscles.",
    "level": 1
  },
  {
    "name": "Centipede, Swarm",
    "flavor": "A crawling mass of weaving, sinuous centipedes.",
    "level": 4
  },
  {
    "name": "Chimera",
    "flavor": "A monstrous beast with a half-goat, half-lion body, wide dragon wings, and the heads of a goat, lion, and dragon.",
    "level": 10
  },
  {
    "name": "Chuul",
    "flavor": "Brown, horse-sized lobster bugs with tentacles and pincers.",
    "level": 5
  },
  {
    "name": "Cloaker",
    "flavor": "A midnight blue manta ray with a bony tail and crescent-shaped maw above its belly. It swoops through deep, lightless caverns.",
    "level": 6
  },
  {
    "name": "Cockatrice",
    "flavor": "A molting, lizard-chicken hybrid with a crimson, razorlike crest.",
    "level": 3
  },
  {
    "name": "Couatl",
    "flavor": "A human-sized snake with scales made of jewels and a corona of iridescent feathers.",
    "level": 9
  },
  {
    "name": "Crab, Giant",
    "flavor": "A wagon-sized, armored crab with two crushing pincers.",
    "level": 5
  },
  {
    "name": "Crocodile",
    "flavor": "Fat, scaly reptiles with stumpy legs and long, thrashing tails.",
    "level": 4
  },
  {
    "name": "Cultist",
    "flavor": "A cloaked, wild-eyed zealot chanting the guttural prayers of a dark god.",
    "level": 2
  },
  {
    "name": "Cyclops",
    "flavor": "Reclusive, one-eyed giants towering 20' high. They live simply on remote farmlands.",
    "level": 8
  },
  {
    "name": "Darkmantle",
    "flavor": "A floating, black octopus with rows of red eyes and a webbed skirt of tentacles.",
    "level": 1
  },
  {
    "name": "Deep One",
    "flavor": "Cultish, amphibious fish-people with bulbous eyes. They lurk in deep water and sunless caverns.",
    "level": 2
  },
  {
    "name": "Demon, Balor",
    "flavor": "Colossal, horned bat-beasts wreathed in the flames of hell itself. Their mighty swords and cracking whips of fire can slice through stone.",
    "level": 16
  },
  {
    "name": "Demon, Dretch",
    "flavor": "Green, pig-faced demons with thick claws and an oily stench.",
    "level": 2
  },
  {
    "name": "Demon, Glabrezu",
    "flavor": "Horse-headed, fanged creatures\r\nwho walk upright and have four\r\narms; two shriveled, and two\r\nending in hulking pincers.",
    "level": 8
  },
  {
    "name": "Demon, Marilith",
    "flavor": "Hissing, armored women with six limbs and the lower bodies of giant snakes. Six whirling blades flash in their hands.",
    "level": 9
  },
  {
    "name": "Demon, Vrock",
    "flavor": "Wagon-sized, filthy vultures with four limbs, midnight-blue skin, and a rash of mangy feathers.",
    "level": 5
  },
  {
    "name": "Devil, Archdevil",
    "flavor": "A stunningly beautiful, horned human with burning, red eyes and a halo of seven black stars. Two stitched-up gashes weep blood from its shoulder blades.",
    "level": 16
  },
  {
    "name": "Devil, Barbed",
    "flavor": "Lanky, green-mottled fiends bristling with hooked spines.",
    "level": 3
  },
  {
    "name": "Devil, Cubi",
    "flavor": "Entrancing humanoids with bat wings and devilish charm.",
    "level": 6
  },
  {
    "name": "Devil, Erinyes",
    "flavor": "Raven-winged, resplendent beings in polished, black armor and helms with curved horns.",
    "level": 9
  },
  {
    "name": "Devil, Horned",
    "flavor": "Iron-scaled hellions as big as ogres with weighty ram horns, lashing tails, and leathery wings. They are opportunistic and craven in battle.",
    "level": 7
  },
  {
    "name": "Devil, Imp",
    "flavor": "Cat-sized, red devils with oversized wings and tail, tiny horns, and cowardly demeanors.",
    "level": 2
  },
  {
    "name": "Dinosaur, Brachiosaurus",
    "flavor": "Colossal, long-necked tree grazers. Slow and peaceful.",
    "level": 12
  },
  {
    "name": "Dinosaur, Plesiosaurus",
    "flavor": "Aquatic reptiles as big as elephants. Flat flippers and narrow, toothy maws on long necks.",
    "level": 6
  },
  {
    "name": "Dinosaur, Pterodactyl",
    "flavor": "Long-beaked beasts with wide, triangular wings. Large enough to carry off a human.",
    "level": 4
  },
  {
    "name": "Dinosaur, Triceratops",
    "flavor": "Plodding herbivores with a wide, bony skull frill and three horns.",
    "level": 7
  },
  {
    "name": "Dinosaur, Tyrannosaurus",
    "flavor": "Towering, bipedal lizards with a massive head, jaws, and neck.",
    "level": 9
  },
  {
    "name": "Dinosaur, Velociraptor",
    "flavor": "Fast, turkey-sized raptors with vicious toe claws. Pack hunters.",
    "level": 2
  },
  {
    "name": "Djinni",
    "flavor": "Azure-blue, jovial humanoids made of air and wind",
    "level": 10
  },
  {
    "name": "Doppelganger",
    "flavor": "Gray, featureless humanoids sowing chaos",
    "level": 4
  },
  {
    "name": "Dragon, Desert",
    "flavor": "The smell of ozone precedes this desert-dwelling dragon. Its dazzling scales of brass and lapis lazuli shimmer in the baking heat.",
    "level": 13
  },
  {
    "name": "Dragon, Fire",
    "flavor": "Blood-red scales cover the hide of this mighty, volcanic wyrm. Leaping flames glow at the back of its throat.",
    "level": 17
  },
  {
    "name": "Dragon, Forest",
    "flavor": "The smell of wet loam follows this dragon. Its jade scales bristle with barbed thorns.",
    "level": 12
  },
  {
    "name": "Dragon, Frost",
    "flavor": "Prismatic ice lines the horns, spines, and wings of this pearly dragon. Clouds of steam hiss from its ice-rimed jaws.",
    "level": 14
  },
  {
    "name": "Dragon, Sea",
    "flavor": "A warm sea breeze blows around this amphibious, gold-scaled wyrm. A beard of tendrils covers its snout, and a blue mane billows along its neck.",
    "level": 16
  },
  {
    "name": "Dragon, Swamp",
    "flavor": "This black, wingless beast slithers through dank swamps.",
    "level": 12
  },
  {
    "name": "Drow",
    "flavor": "A graceful, shadowy elf that pounces like a spider.",
    "level": 2
  },
  {
    "name": "Drow, Drider",
    "flavor": "A monstrosity with the body of a giant spider and torso of a drow.",
    "level": 6
  },
  {
    "name": "Drow, Priestess",
    "flavor": "A statuesque female drow with a Imperial of metal spider webs and an imperious gaze.",
    "level": 6
  },
  {
    "name": "Druid",
    "flavor": "A wizard of the wilds holding a knotted staff and wearing a mossy cloak of deep viridian.",
    "level": 7
  },
  {
    "name": "Dryad",
    "flavor": "A coy, emerald-skinned fey covered in leaves. It bonds with and protects a tree.",
    "level": 4
  },
  {
    "name": "Duergar",
    "flavor": "Gray-skinned, greedy dwarves with bald pates and white beards. They dwell in somber castles deep within the earth filled with stolen treasures and enslaved prisoners.",
    "level": 2
  },
  {
    "name": "Dung Beetle, Giant",
    "flavor": "A trundling, barrel-sized beetle with a T-shaped horn.",
    "level": 2
  },
  {
    "name": "Efreeti",
    "flavor": "Blood-red, towering humanoids formed of lava and ash. Short, black horns and snarling grins.",
    "level": 9
  },
  {
    "name": "Elemental, Air",
    "flavor": "A howling tornado of wind.",
    "level": "*"
  },
  {
    "name": "Elemental, Earth",
    "flavor": "A thundering pillar of earth.",
    "level": "*"
  },
  {
    "name": "Elemental, Fire",
    "flavor": "A roaring column of flames.",
    "level": "*"
  },
  {
    "name": "Elemental, Water",
    "flavor": "A crashing vortex of water.",
    "level": "*"
  },
  {
    "name": "Elephant",
    "flavor": "Mighty mammals with tough hide, flappy ears, and a trunk.",
    "level": 7
  },
  {
    "name": "Elf",
    "flavor": "Ethereal, ageless fey-people infused with ancient magic.",
    "level": 2
  },
  {
    "name": "Ettercap",
    "flavor": "Bipedal, eight-eyed spiderfolk with spindly legs and purple fur.",
    "level": 3
  },
  {
    "name": "Fairy",
    "flavor": "Miniature fey folk with fluttering moth or butterfly wings.",
    "level": 1
  },
  {
    "name": "Frog, Giant",
    "flavor": "Human-sized frogs with warty skin and long, sticky tongues.",
    "level": 2
  },
  {
    "name": "Gargoyle",
    "flavor": "Leering, winged fiends that look like stone statues. They can hold perfectly still for long stretches of time.",
    "level": 4
  },
  {
    "name": "Gelatinous Cube",
    "flavor": "A translucent cube of slime that silently mows through tunnels.",
    "level": 5
  },
  {
    "name": "Ghast",
    "flavor": "Greater ghouls who retain the intelligence they had in life.",
    "level": 4
  },
  {
    "name": "Ghost",
    "flavor": "A wavering spirit with a face contorted in rage or sadness.",
    "level": 6
  },
  {
    "name": "Ghoul",
    "flavor": "Gray-skinned, slavering undead with whipping tongues and flat, reptilian faces.",
    "level": 2
  },
  {
    "name": "Giant, Cloud",
    "flavor": "Pale, angular giants with blue-gray hair, light eyes, and silk robes. They do not allow outsiders into their enclaves.",
    "level": 10
  },
  {
    "name": "Giant, Fire",
    "flavor": "Bulky, muscled giants with coppery skin and red hair. Heavily armored in iron plate mail studded with bronze rivets.",
    "level": 9
  },
  {
    "name": "Giant, Frost",
    "flavor": "Blue-skinned warriors with broad shoulders and braided hair. They sound war horns during their frequent raids.",
    "level": 9
  },
  {
    "name": "Giant, Goat",
    "flavor": "Highland-dwelling, barbaric giants with goatlike legs, horns, and horizontal pupils.",
    "level": 8
  },
  {
    "name": "Giant, Hill",
    "flavor": "Fleshy hulks with leathery skin and broad, sloping foreheads. Cruel, boorish, and dim-witted.",
    "level": 7
  },
  {
    "name": "Giant, Stone",
    "flavor": "Lean, sinewy giants with stony skin and deep-set eyes. They are quiet and poised, often sitting motionless.",
    "level": 8
  },
  {
    "name": "Giant, Storm",
    "flavor": "Regal titans with sea-green skin, flowing white hair, and thundering voices. They breathe water as easily as air.",
    "level": 12
  },
  {
    "name": "Gibbering Mouther",
    "flavor": "Crawling masses of slime with dozens of screeching, lipless mouths and wet eyeballs.",
    "level": 4
  },
  {
    "name": "Gladiator",
    "flavor": "Veteran warriors seasoned in arena fights to the death.",
    "level": 3
  },
  {
    "name": "Gnoll",
    "flavor": "Barbaric, opportunistic hyenafolk who range in large packs.",
    "level": 2
  },
  {
    "name": "Gnome, Deep",
    "flavor": "Gray-skinned, white-haired fey the size of halflings. They hunt for gems and rare cave flora.",
    "level": 3
  },
  {
    "name": "Goblin",
    "flavor": "A short, hairless humanoid with green skin and pointy ears.",
    "level": 1
  },
  {
    "name": "Goblin, Boss",
    "flavor": "A scarred goblin with knotted muscles and a Imperial of iron.",
    "level": 4
  },
  {
    "name": "Goblin, Shaman",
    "flavor": "A swaying, chanting goblin wearing necklaces of teeth and a",
    "level": 4
  },
  {
    "name": "Golem, Clay",
    "flavor": "A towering, faceless humanoid shaped from glistening clay",
    "level": 8
  },
  {
    "name": "Golem, Flesh",
    "flavor": "A ghastly monstrosity made of sewn-together corpses.",
    "level": 7
  },
  {
    "name": "Golem, Iron",
    "flavor": "A bulky iron suit that squeals and sparks with each step",
    "level": 10
  },
  {
    "name": "Golem, Stone",
    "flavor": "A wide-limbed, lumbering statue that shakes the ground.",
    "level": 8
  },
  {
    "name": "Gorgon",
    "flavor": "A snorting bull made entirely of iron plating. A cloud of green fog billows from its nostrils.",
    "level": 7
  },
  {
    "name": "Gorilla",
    "flavor": "Mighty, jungle-dwelling apes.",
    "level": 4
  },
  {
    "name": "Gray Ooze",
    "flavor": "Slick puddles the color of stone.",
    "level": 2
  },
  {
    "name": "Grick",
    "flavor": "A huge worm with four suckered tentacles and a snapping beak.",
    "level": 4
  },
  {
    "name": "Griffon",
    "flavor": "Winged hunters with the head of an eagle and body of a lion. Their favored food is horses.",
    "level": 4
  },
  {
    "name": "Grimlow",
    "flavor": "A tall, oval-shaped mammal. A giant, half-moon maw hides on its belly beneath its gray fur.",
    "level": 9
  },
  {
    "name": "Guard",
    "flavor": "A sentry equipped with sturdy weapons and armor.",
    "level": 1
  },
  {
    "name": "Hag, Night",
    "flavor": "A purple-skinned, stooped woman with stringy, white hair and a mouth full of iron teeth.",
    "level": 8
  },
  {
    "name": "Hag, Sea",
    "flavor": "A green, sunken-faced woman. Seaweed hair and oozing flesh.",
    "level": 6
  },
  {
    "name": "Hag, Weald",
    "flavor": "Eyes dark as moonless nights, skin made of rotting wood, hair of tangled roots and vines.",
    "level": 6
  },
  {
    "name": "Harpy",
    "flavor": "Horrific, winged women with vulture-like lower bodies. They keen a hypnotic song.",
    "level": 3
  },
  {
    "name": "Hell Hound",
    "flavor": "Black wolfhounds with red eyes and jaws dripping with flames.",
    "level": 4
  },
  {
    "name": "Hippogriff",
    "flavor": "Fierce, winged creatures with the lower body of a horse and upper body of a giant eagle.",
    "level": 3
  },
  {
    "name": "Hippopotamus",
    "flavor": "Ornery river-beasts as large as cows with round, purple bodies and bulbous snouts.",
    "level": 5
  },
  {
    "name": "Hobgoblin",
    "flavor": "A sturdy, tall goblin with russet skin. Militant and strategic.",
    "level": 2
  },
  {
    "name": "Horse",
    "flavor": "Powerful, swift herd animals that roam open plains.",
    "level": 2
  },
  {
    "name": "Hydra",
    "flavor": "A towering, amphibious reptile with a bouquet of snake heads writhing on long necks.",
    "level": "*"
  },
  {
    "name": "Invisible Stalker",
    "flavor": "Intelligent creatures made of flowing air. Often bound to the bidding of evil sorcerers.",
    "level": 6
  },
  {
    "name": "Jellyfish",
    "flavor": "Hand-sized, purple sea jellies with stinging tentacles.",
    "level": 0
  },
  {
    "name": "Knight",
    "flavor": "A warrior in shining plate mail and the surcoat of a knightly order.",
    "level": 3
  },
  {
    "name": "Kobold",
    "flavor": "Puny, scaled coyote-lizards that dwell underground.",
    "level": 0
  },
  {
    "name": "Kobold, Sorcerer",
    "flavor": "A scaly dog-lizard painted with colorful stripes and rattling a hefty leg bone strung with beads and feathers.",
    "level": 3
  },
  {
    "name": "Kraken",
    "flavor": "Primordial, tentacled leviathans the size of war galleons. They live in the lightless depths of the deep ocean.",
    "level": 17
  },
  {
    "name": "Leech, Giant",
    "flavor": "A glossy black, blood-drinking slug as large as a cat.",
    "level": 2
  },
  {
    "name": "Leprechaun",
    "flavor": "Impish fey who favor green garb and love fooling \"tall folk\" with promises of gold.",
    "level": 4
  },
  {
    "name": "Lich",
    "flavor": "A wizard who has completed a necromantic ritual to become a mighty, undead sorcerer. Its withered body is draped in moldering, silk robes, and red marshlights burn in its eyes.",
    "level": 13
  },
  {
    "name": "Lion",
    "flavor": "Tawny great cats that hunt open planes. Males have manes.",
    "level": 3
  },
  {
    "name": "Lizardfolk",
    "flavor": "Crocodilian humanoids with scaly faces, claws, and tails. They dwell in swamps and rivers.",
    "level": 2
  },
  {
    "name": "Mage",
    "flavor": "Trained wizards who are often members of a sorcerous order.",
    "level": 6
  },
  {
    "name": "Mammoth",
    "flavor": "Massive, shaggy elephants with tusks that reach the ground.",
    "level": 9
  },
  {
    "name": "Manta Ray, Giant",
    "flavor": "Swooping manta rays as large",
    "level": 8
  },
  {
    "name": "Manticore",
    "flavor": "Human-faced lions with bat",
    "level": 6
  },
  {
    "name": "Mastiff",
    "flavor": "Muscled guard dogs with fierce",
    "level": 1
  },
  {
    "name": "Medusa",
    "flavor": "Immortal women with coiling",
    "level": 8
  },
  {
    "name": "Merfolk",
    "flavor": "Ocean dwellers with human",
    "level": 2
  },
  {
    "name": "Mimic",
    "flavor": "Beasts that look like objects.",
    "level": 5
  },
  {
    "name": "Minotaur",
    "flavor": "Ferocious bull-men with hooves and curved horns. They live in mazelike tunnels.",
    "level": 7
  },
  {
    "name": "Moose",
    "flavor": "A towering, brown-haired grazer with weighty, flat antlers.",
    "level": 4
  },
  {
    "name": "Mordanticus The Flayed",
    "flavor": "A skinless mummy-lich wearing a Imperial set with nine bright gems. Once the head of the ancient, wizardly order of Gehemna, Mordanticus now lives in secret within the sanctum of Gehemna's reigning archmage. He has served as an advisor and historian for centuries, but an enduring enchantment prevents him from speaking of two topics: his origins, and The Ten-Eyed Oracle.",
    "level": 19
  },
  {
    "name": "Mummy",
    "flavor": "A desiccated, linen-wrapped zombie.",
    "level": 10
  },
  {
    "name": "Mushroomfolk",
    "flavor": "Lumbering humanoids with spongy, elongated bodies.",
    "level": 3
  },
  {
    "name": "Naga",
    "flavor": "Magic-wielding cobras towering ten feet high.",
    "level": 9
  },
  {
    "name": "Naga, Bone",
    "flavor": "Mindless, skeletal husks of nagas reanimated by sorcery.",
    "level": 6
  },
  {
    "name": "Nightmare",
    "flavor": "Black warhorses with flaming manes, hooves, and eyes.",
    "level": 6
  },
  {
    "name": "Obe-Ixx Of Azarumme",
    "flavor": "A pale, angular woman in translucent plate mail fashioned from giant scorpion chitin. Obe-Ixx, daughter of Azarumme, rose up from the prehistoric barbarian tribes of Tal-Yool to conquer all in her path. One day, she stood at the steps of an obsidian ziggurat deep within the trackless jungle. Forty nights later, Obe-Ixx emerged as the ur-vampire, bloodlust made flesh. Her dynasty would rise and fall again and again over the coming millennia.",
    "level": 16
  },
  {
    "name": "Ochre Jelly",
    "flavor": "An orange puddle of quivering slime.",
    "level": 4
  },
  {
    "name": "Octopus, Giant",
    "flavor": "Octopi as large as sailing skiffs.",
    "level": 5
  },
  {
    "name": "Ogre",
    "flavor": "A massive, dim-witted brute with tusks and a heavy frame. Often lords over goblins or orcs.",
    "level": 6
  },
  {
    "name": "Oni",
    "flavor": "Cunning and sorcerous ogre-demons with shaggy white hair, blue skin, and yellow eyes.",
    "level": 7
  },
  {
    "name": "Orc",
    "flavor": "A tusked, tall humanoid with gray skin and pointed ears.",
    "level": 1
  },
  {
    "name": "Orc, Chieftain",
    "flavor": "An imposing orc with scars crisscrossing its body.",
    "level": 4
  },
  {
    "name": "Otyugh",
    "flavor": "Stumpy, three-legged beasts with barbed tentacles and vast",
    "level": 7
  },
  {
    "name": "Outsider, Primordial Slime",
    "flavor": "A mass of clear ooze strobing with sick pulses of violet light.",
    "level": 6
  },
  {
    "name": "Outsider, Rime Walker",
    "flavor": "Human-shaped beings formed from black space ice. Their eyes are two flickering, white lights.",
    "level": 9
  },
  {
    "name": "Outsider, Void Spawn",
    "flavor": "Scythe-like limbs jut from a purple bulb as big as an ogre. Its lower half is a nest of tentacles.",
    "level": 7
  },
  {
    "name": "Outsider, Void Spider",
    "flavor": "Pale, horse-sized arachnids that become ghostly and intangible.",
    "level": 5
  },
  {
    "name": "Owlbear",
    "flavor": "Cantankerous bears with owl eyes, beaks, and feathers.",
    "level": 6
  },
  {
    "name": "Panther",
    "flavor": "Supple large cats with blue-black fur. Stealthy hunters.",
    "level": 3
  },
  {
    "name": "Peasant",
    "flavor": "A commoner in worn clothes.",
    "level": 1
  },
  {
    "name": "Pegasus",
    "flavor": "Winged horses with noble bearings and pearly white coats.",
    "level": 3
  },
  {
    "name": "Phoenix",
    "flavor": "Huge, soaring eagles made of searing flames. Intelligent and imbued with immortal magic.",
    "level": 13
  },
  {
    "name": "Piranha, Swarm",
    "flavor": "A school of flat, silvery fish with vicious fangs.",
    "level": 3
  },
  {
    "name": "Pirate",
    "flavor": "Seafaring scoundrels who live to steal and hoard treasure.",
    "level": 1
  },
  {
    "name": "Priest",
    "flavor": "A respected member of a clergy who leads holy rituals and rites.",
    "level": 5
  },
  {
    "name": "Purple Worm",
    "flavor": "A massive worm as tall as a castle keep. Has a rotating maw and is covered in purple chitin.",
    "level": 12
  },
  {
    "name": "Rakshasa",
    "flavor": "Demonic illusionists whose true form is of a humanlike great cat with backwards hands.",
    "level": 8
  },
  {
    "name": "Rat",
    "flavor": "Rangy, plague-carrying rodents that infest underground places.",
    "level": 0
  },
  {
    "name": "Rat, Dire",
    "flavor": "Child-sized, savage rats bristling with bony face and spine ridges.",
    "level": 2
  },
  {
    "name": "Rat, Giant",
    "flavor": "Cunning rats as large as cats. Mangy fur and wormlike tails.",
    "level": 1
  },
  {
    "name": "Rat, Swarm",
    "flavor": "A screeching tidal wave of clawing and biting rats.",
    "level": 6
  },
  {
    "name": "Rathgamnon",
    "flavor": "A pearl-white lion with feathered wings that stands twenty feet tall. Rathgamnon is Madeera the Covenant's mightiest servant; his blank eyes see far into the depths of time and space. He spends all eternity watching the whirl of the stars from the highest mountain in the realm of mortals, waiting for the celestial alignments that prophesy epochs of weal and woe, titanic changes to the balance of power in the cosmos, or threats to the laws of reality itself.",
    "level": 19
  },
  {
    "name": "Reaver",
    "flavor": "A knight in blackened armor riddled with cruel barbs.",
    "level": 6
  },
  {
    "name": "Remorhaz",
    "flavor": "Massive, blue centipedes with neck hoods and red-hot spine spikes. Dwell in arctic climates.",
    "level": 10
  },
  {
    "name": "Rhinoceros",
    "flavor": "Gray-skinned bulls with single nose horns. Dwell in grasslands.",
    "level": 5
  },
  {
    "name": "Roc",
    "flavor": "Dragon-sized hawks that nest in remote mountains.",
    "level": 15
  },
  {
    "name": "Roper",
    "flavor": "Ravenous monstrosities that look like cave rocks when their single eye and maw are closed.",
    "level": 6
  },
  {
    "name": "Rot Flower",
    "flavor": "Carnivorous flowers as large as a human. They reek of carrion.",
    "level": 2
  },
  {
    "name": "Rust Monster",
    "flavor": "A mud-brown insect as big as a wolf with two feathery antennae. Consumes metal.",
    "level": 4
  },
  {
    "name": "Sahuagin",
    "flavor": "Humanoids with sea-green skin, webbed limbs, and shark teeth. Vicious hunters.",
    "level": 2
  },
  {
    "name": "Salamander",
    "flavor": "Fire-colored lizardfolk with long tails. Flame-like frills run down their backs.",
    "level": 5
  },
  {
    "name": "Scarab, Swarm",
    "flavor": "A chittering cloud of iridescent, oval-shaped beetles.",
    "level": 3
  },
  {
    "name": "Scarecrow",
    "flavor": "Ragged clothes and a painted burlap head stuffed with straw. Possessed by a malicious spirit.",
    "level": 3
  },
  {
    "name": "Scorpion",
    "flavor": "Desert-dwelling arachnids with pincers and curved tail stingers.",
    "level": 0
  },
  {
    "name": "Scorpion, Giant",
    "flavor": "Chitin-plated scorpions as big as camels.",
    "level": 3
  },
  {
    "name": "Shadow",
    "flavor": "Flitting, sentient shadows in the vague shape of a human.",
    "level": 3
  },
  {
    "name": "Shambling Mound",
    "flavor": "Fetid piles of slimy vegetation animated to life by lightning.",
    "level": 4
  },
  {
    "name": "Shark",
    "flavor": "Bloodthirsty apex predators of the sea. Gray, torpedo-like body.",
    "level": 3
  },
  {
    "name": "Shark, Megalodon",
    "flavor": "Primordial sharks the size of whales. Savage hunters.",
    "level": 8
  },
  {
    "name": "Siren",
    "flavor": "Baleful fey with dove wings and iridescent fish scales. Their singing entrances listeners.",
    "level": 4
  },
  {
    "name": "Skeleton",
    "flavor": "A bleach-boned skeleton with red pinpoints of light in its eyes.",
    "level": 2
  },
  {
    "name": "Smilodon",
    "flavor": "Prehistoric tigers with long canine fangs. They hunt grasslands and ice fields.",
    "level": 3
  },
  {
    "name": "Snake, Cobra",
    "flavor": "A weaving serpent with a neck hood and lethal venom.",
    "level": 1
  },
  {
    "name": "Snake, Giant",
    "flavor": "An enormous, mottled serpent that can swallow a cow whole.",
    "level": 5
  },
  {
    "name": "Snake, Swarm",
    "flavor": "A roiling wave of snakes darting and flowing across the ground.",
    "level": 4
  },
  {
    "name": "Soldier",
    "flavor": "An armed footsoldier trained in the ways of battlefield combat.",
    "level": 2
  },
  {
    "name": "Sphinx",
    "flavor": "A winged, leonine oracle who can see into time and space and often speaks in riddles. Lives in isolated mountains.",
    "level": 9
  },
  {
    "name": "Spider",
    "flavor": "Silent, web-weaving arachnids with a flesh-dissolving venom.",
    "level": 0
  },
  {
    "name": "Spider, Giant",
    "flavor": "Bulbous abdomen and eight, spindly legs. Dwells high in trees or caves and ambushes prey, capturing them to eat later.",
    "level": 3
  },
  {
    "name": "Spider, Swarm",
    "flavor": "A scurrying carpet of spiders.",
    "level": 2
  },
  {
    "name": "Stingbat",
    "flavor": "Darting, orange insect-bat with four wings and needlelike beak.",
    "level": 1
  },
  {
    "name": "Strangler",
    "flavor": "A gray-skinned, gaunt creature with four ropy limbs tipped in sucker-lined claws.",
    "level": 3
  },
  {
    "name": "The Tarrasque",
    "flavor": "A colossal, four-legged reptile with crocodilian jaws, amber scales, and a diamond-hard, spiked carapace. It towers overhead like a mountain, able to swallow entire villages in one gulp. The tarrasque hibernates deep in the earth or at the bottom of the sea for centuries, only awakening long enough to fill its vast belly in an indiscriminate rampage of terror and destruction. There is only one tarrasque, and it is the most dreaded creature to walk the earth.",
    "level": 30
  },
  {
    "name": "The Ten-Eyed Oracle",
    "flavor": "A floating mass of rubbery skin crusted with barnacles. Its ten eyestalks writhe like snakes, and a deep, circular scar mars its central body, blinding what was once a large eye above a lipless maw. The Ten-Eyed Oracle stalks the Shadowdark, burbling mad prophesies and somehow moving freely between the lightless fathoms of the earth. The keepers of the deep lore suspect The Ten-Eyed Oracle was once a benevolent ally of mankind, but an unknown calamity drove it to insanity and reckless hatred.",
    "level": 18
  },
  {
    "name": "The Wandering Merchant",
    "flavor": "A cheerful merchant who appears to be a hale, middle-aged human man with a handlebar mustache. He wears a white shirt, breeches, and leather apron, and he hauls a towering backpack bursting at the seams. Few know the merchant's true nature and origins, though some theorize he is an immortal being or a god (they are not entirely incorrect). The Wandering Merchant always has something useful, far-flung, or incredible to sell at a reasonable price, and there's no telling when or where he'll show up next...",
    "level": 15
  },
  {
    "name": "Thief",
    "flavor": "A cat burglar in a black cloak.",
    "level": 3
  },
  {
    "name": "Thug",
    "flavor": "A bruised and boorish ruffian.",
    "level": 1
  },
  {
    "name": "Treant",
    "flavor": "Peaceful, slow-moving trees with merry eyes and tremulous voices. They protect the forest.",
    "level": 8
  },
  {
    "name": "Troll",
    "flavor": "Green, lanky giants with warty skin and territorial rage. Lair in deep forests and swamps.",
    "level": 5
  },
  {
    "name": "Troll, Frost",
    "flavor": "Rime-covered trolls with blue skin and flinty, black eyes. They stalk arctic lands and frozen boreal forests.",
    "level": 7
  },
  {
    "name": "Unicorn",
    "flavor": "A silvery horse with a flowing mane and a single spiral horn.",
    "level": 4
  },
  {
    "name": "Vampire",
    "flavor": "Pale, blood-drinking undead of supreme power and wickedness. They loathe sunlight and protect",
    "level": 11
  },
  {
    "name": "Vampire Spawn",
    "flavor": "Lesser, feral vampires born from the bite of their vampiric sires. Bloodthirsty and savage. They rarely leave a victim alive.",
    "level": 5
  },
  {
    "name": "Violet Fungus",
    "flavor": "Child-sized, creeping fungi with neon purple caps. Their whiplike roots decompose living flesh.",
    "level": 2
  },
  {
    "name": "Viperian",
    "flavor": "Lithe, snake-headed people with cobra hoods and emerald green scales covering their bodies.",
    "level": 3
  },
  {
    "name": "Viperian, Ophid",
    "flavor": "A giant anaconda body merges into a humanoid torso with a large snake head. It wears golden torcs and strings of glittering moonstones.",
    "level": 6
  },
  {
    "name": "Viperian, Wizard",
    "flavor": "Thin viperians with scales tinged in black. They wear silk robes and silver, serpentine jewelry.",
    "level": 8
  },
  {
    "name": "Vulture",
    "flavor": "Scavenger birds with black feathers, hunched backs, and bald heads.",
    "level": 1
  },
  {
    "name": "Wasp, Giant",
    "flavor": "Man-sized wasps with glossy, yellow-striped abdomens.",
    "level": 2
  },
  {
    "name": "Wererat",
    "flavor": "A slinking, rat-faced humanoid covered in mangy fur.",
    "level": 3
  },
  {
    "name": "Werewolf",
    "flavor": "A bipedal, wolf-faced humanoid covered in brown fur.",
    "level": 4
  },
  {
    "name": "Wight",
    "flavor": "A pale, armored undead warrior with sinister intelligence.",
    "level": 3
  },
  {
    "name": "Will-O'-Wisp",
    "flavor": "A bobbing marsh light animated by an evil spirit. It tries to lead the living into danger.",
    "level": 2
  },
  {
    "name": "Wolf",
    "flavor": "A giant canine with a gray pelt, yellow eyes, and dripping jaws.",
    "level": 2
  },
  {
    "name": "Wolf, Dire",
    "flavor": "A massive wolf with spines of black bone along its brow ridge and back.",
    "level": 4
  },
  {
    "name": "Wolf, Winter",
    "flavor": "Sinister, white-pelted wolves with piercing blue eyes. From the fey realms of eternal winter.",
    "level": 5
  },
  {
    "name": "Worg",
    "flavor": "Bat-faced wolves that speak Goblin and often serve as war mounts for goblinkind.",
    "level": 3
  },
  {
    "name": "Wraith",
    "flavor": "A shadowy spirit seething with anger and malice. Its presence is unsettling to animals.",
    "level": 8
  },
  {
    "name": "Wyvern",
    "flavor": "Dragon-cousins with a large tail stinger, mottled lizard skin, and leathery wings.",
    "level": 8
  },
  {
    "name": "Zombie",
    "flavor": "Lurching and decomposed undead that hunt in mobs.",
    "level": 2
  }
]
function nextCatalogIndex(random: D6Random, count: number): number {
  const digits = Math.ceil(Math.log(count) / Math.log(6))
  const range = 6 ** digits
  const limit = range - (range % count)
  let value = 0
  do {
    value = 0
    for (let index = 0; index < digits; index++) value = value * 6 + random.nextD6() - 1
  } while (value >= limit)
  return value % count
}

function nextStableCatalogIndex(random: D6Random, count: number): number {
  // Keep level-filtered table construction on the same four-D6 cadence as
  // the complete catalog, so changing the eligible pool does not shift later
  // room, trap, or hazard rolls in the shared deterministic stream.
  const digits = Math.ceil(Math.log(MONSTER_CATALOG.length) / Math.log(6))
  let value = 0
  for (let index = 0; index < digits; index++) value = value * 6 + random.nextD6() - 1
  return value % count
}
export function pickRandomMonster(random: D6Random): MonsterRecord {
  return MONSTER_CATALOG[nextCatalogIndex(random, MONSTER_CATALOG.length)]!
}

export const MONSTER_ENCOUNTER_TABLE_SIZE = 5

/** Build a dungeon-local encounter table without repeating a monster entry. */
export function createMonsterEncounterTable(random: D6Random, size = MONSTER_ENCOUNTER_TABLE_SIZE): MonsterRecord[] {
  if (!Number.isInteger(size) || size < 1 || size > MONSTER_CATALOG.length) throw new RangeError('Monster encounter table size is out of range.')
  const remaining = [...MONSTER_CATALOG]
  const table: MonsterRecord[] = []
  while (table.length < size) table.push(remaining.splice(nextCatalogIndex(random, remaining.length), 1)[0]!)
  return table
}

/** Build a table from monsters appropriate for the selected party level. */
export function createMonsterEncounterTableForBudget(random: D6Random, budget: DungeonLevelBudget, size = MONSTER_ENCOUNTER_TABLE_SIZE): MonsterRecord[] {
  const eligible = MONSTER_CATALOG.filter(monster => {
    const level = typeof monster.level === 'number' && Number.isFinite(monster.level) ? monster.level : null
    return level !== null && level >= budget.monsterLevelMin && (budget.monsterLevelMax === null || level <= budget.monsterLevelMax)
  })
  if (eligible.length < size) throw new RangeError(`Monster catalog has fewer than ${size} entries for monster level ${budget.monsterLevelLabel}.`)
  const remaining = [...eligible]
  const table: MonsterRecord[] = []
  while (table.length < size) table.push(remaining.splice(nextStableCatalogIndex(random, remaining.length), 1)[0]!)
  return table
}

export function pickRandomMonsterFromTable(random: D6Random, table: readonly MonsterRecord[]): MonsterRecord {
  if (table.length === 0) throw new RangeError('Cannot pick a monster from an empty encounter table.')
  return table[nextCatalogIndex(random, table.length)]!
}
