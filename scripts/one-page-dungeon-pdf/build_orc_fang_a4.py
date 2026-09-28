import argparse
import json
import math
import random
import re
import unicodedata
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description="Build the Orc Fang one-page dungeon PDF.")
parser.add_argument("--source", type=Path, required=True, help="Torch & Tile dungeon JSON file")
parser.add_argument(
    "--output-dir",
    type=Path,
    default=ROOT / "dist" / "one-page-dungeon-pdf",
    help="Directory for the generated PDF (default: dist/one-page-dungeon-pdf)",
)
parser.add_argument("--printer", action="store_true", help="Use the black-and-white printer palette")
args = parser.parse_args()


def resolve_path(path):
    return path.resolve() if path.is_absolute() else (Path.cwd() / path).resolve()


SOURCE = resolve_path(args.source)
OUTPUT_DIR = resolve_path(args.output_dir)
PRINTER = args.printer
OUTPUT = OUTPUT_DIR / ("orc-fang-printer-a4.pdf" if PRINTER else "orc-fang-five-loop-a4.pdf")
DATA = json.loads(SOURCE.read_text(encoding="utf-8"))

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 22
GUTTER = 14
LEDGER_W = 347
LEFT_X = MARGIN
LEFT_W = PAGE_W - MARGIN * 2 - GUTTER - LEDGER_W
RIGHT_X = LEFT_X + LEFT_W + GUTTER
RIGHT_BOTTOM = 26
BODY_TOP = PAGE_H - 80

if PRINTER:
    BG = HexColor("#FFFFFF")
    INK = HexColor("#171717")
    MID = HexColor("#383838")
    HAIR = HexColor("#B8B8B8")
    PANEL = HexColor("#FFFFFF")
    ROCK = HexColor("#FFFFFF")
    ROCK_EDGE = HexColor("#666666")
    FLOOR = HexColor("#FFFFFF")
    FLOOR_EDGE = HexColor("#C6C6C6")
    WATER = HexColor("#CCCCCC")
    LOCKED = SECRET = ONE_WAY = KEY_DEFAULT = ACCENT = INK
else:
    BG = HexColor("#EFE3C9")
    INK = HexColor("#29291F")
    MID = HexColor("#514637")
    HAIR = HexColor("#C3AF87")
    PANEL = HexColor("#F7EEDB")
    ROCK = HexColor("#DED0AF")
    ROCK_EDGE = HexColor("#7C7056")
    FLOOR = HexColor("#FFF8E9")
    FLOOR_EDGE = HexColor("#C8BCAA")
    WATER = HexColor("#6EA8BC")
    LOCKED = HexColor("#B84E3C")
    SECRET = HexColor("#765F9B")
    ONE_WAY = HexColor("#BB7A2D")
    KEY_DEFAULT = HexColor("#D0A13B")
    ACCENT = HexColor("#81382D")
FONT_BODY = "Arial"
FONT_BOLD = "Arial-Bold"
FONT_TITLE = "Georgia-Bold"

for name, filename in ((FONT_BODY, "arial.ttf"), (FONT_BOLD, "arialbd.ttf"), (FONT_TITLE, "georgiab.ttf")):
    pdfmetrics.registerFont(TTFont(name, str(Path("C:/Windows/Fonts") / filename)))

ROOM_SUMMARIES = {
    1: "A tightly closed hatch vents blinding ash when lifted. Bootprints in the ash lead west.",
    2: "A Flint-Tusk deserter hides in the feed trough. Food buys the drum's location: 5.",
    3: "A horn platform overlooks both approaches. Sound it; all orcs hunt the caller, clearing other routes.",
    4: "A false-bottom chest holds 20 gp and a clay rubbing of the hidden door near 11.",
    5: "Four Flint-Tusk scouts (LV 1) squabble over Red-Maw's drum. Return it for Red-Maw passage.",
    6: "An orc banner hangs upside down: Red-Maw's challenge to Split-Crown. Turning it summons a challenger.",
    7: "A bronze tusk key opens the three doors marked 6 around Challenge Banner. Loud steps loose ceiling darts and alert 5.",
    8: "A scorched coffer holds 22 gp. Its lid bears the mark of the Bone-Lender shrine at 15.",
    9: "Two cave goats chew a warning rope. Free them to stampede through 10 and scatter guards.",
    10: "A Red-Maw runner (LV 1) carries orders: seize the standard at 23 before the dusk oath.",
    11: "Brown mold drinks flame. In darkness, each creature here takes 1d6 cold damage each round.",
    12: "A split tusk scratched into the wall points toward a nearby secret seam.",
    13: "A skewered orc marks a blade's reach. Cross low, or the spring blade strikes the first upright body (+5 to hit, 1d8 damage).",
    14: "A wooden tithe box holds 21 gp. Scratched inside: 'The dead hear every promise.'",
    15: "Two Bone-Lender wardens (LV 2) bargain with a cave spirit. Break the bone circle to stop rising skeletons.",
    16: "Four Flint-Tusk scouts (LV 1) mend a drum frame. They swap its beat for Red-Maw secrets.",
    17: "A hanging gong signals the shrine. Strike it and 15 arrives; cut it down for 20 gp bronze.",
    18: "A narrow ledge skirts a deep crack. Boot scrapes lead to a concealed door; noise from a fall raises the alarm.",
    19: "Two Red-Maw chainbreakers (LV 2) drag a caged rival. Free her; she shows the shortcut to 23.",
    20: "A blood-smeared oath stone names the clans. Erase a name and its orcs refuse the pact.",
    21: "Split-Crown's empty watch post has a speaking horn aimed through a crack at 23. Eavesdrop on the captains.",
    22: "A burnt tusk carving worth 20 gp conceals a message: 'Crown first, blood second.'",
    23: "Two Split-Crown captains (LV 3) fight over the war chest beneath the war standard. Steal or burn the standard to break the pact; 116 gp inside.",
    24: "Two Bone-Lender wardens (LV 2) guard the key to the three doors marked 20 around Oath Stone. Promise a captive to gain it.",
}
ROOM_DISPLAY_NAMES = {
    1:"Tusk Gate",2:"Feed Trough",3:"Horn Lookout",4:"False Chest",5:"Drum Thieves",6:"Challenge Banner",
    7:"Key to Banner",8:"Scorched Coffer",9:"Goat Pen",10:"Red-Maw Runner",11:"Hungry Mold",12:"Tusk Mark",
    13:"Spring Blade",14:"Tithe Box",15:"Bone Circle",16:"Drum Frame",17:"Hanging Gong",18:"Crack Ledge",
    19:"Caged Rival",20:"Oath Stone",21:"Watch Post",22:"Burnt Tusk",23:"War Standard",24:"Key to Oath Stone",
}


def ascii_text(value):
    value = str(value or "")
    for old, new in {
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2026": "...",
    }.items():
        value = value.replace(old, new)
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def wrap_text(text, font, size, width):
    words = re.sub(r"\s+", " ", ascii_text(text)).strip().split(" ")
    if not words or words == [""]:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def detail_paragraphs(value):
    paragraphs = []
    for line in str(value or "Empty room.").splitlines():
        line = ascii_text(line).strip()
        if line:
            paragraphs.append(line)
    return paragraphs or ["Empty room."]


def ledger_layout(entries, body_size, body_leading, head_size, head_leading, entry_gap, width):
    measurements = []
    for entry in entries:
        number = int(entry.get("number", 0))
        paragraphs = detail_paragraphs(ROOM_SUMMARIES.get(number, entry.get("details", "")))
        wrapped = [wrap_text(p, FONT_BODY, body_size, width) for p in paragraphs]
        body_height = sum(len(lines) * body_leading for lines in wrapped)
        body_height += max(0, len(wrapped) - 1) * 1.0
        measurements.append((entry, wrapped, head_leading + body_height + entry_gap))
    return measurements, sum(item[2] for item in measurements)


def project_top_down(col, row, left, bottom, cell, rows):
    return left + (col + 0.5) * cell, bottom + (rows - row - 0.5) * cell


def polygon(pdf, points, fill, stroke=None, stroke_width=0.3):
    path = pdf.beginPath()
    path.moveTo(points[0][0], points[0][1])
    for x, y in points[1:]:
        path.lineTo(x, y)
    path.close()
    pdf.setFillColor(fill)
    if stroke is None:
        pdf.drawPath(path, fill=1, stroke=0)
    else:
        pdf.setStrokeColor(stroke)
        pdf.setLineWidth(stroke_width)
        pdf.drawPath(path, fill=1, stroke=1)


def draw_top_down_map(pdf):
    source_cols = int(DATA["cols"])
    cols = 76  # Last occupied column is 75; remove empty rock at the east edge.
    rows = int(DATA["rows"])
    grid = DATA["grids"].get("0", [0] * (source_cols * rows))
    cell = min((LEFT_W - 10) / cols, 322 / rows)
    map_w, map_h = cols * cell, rows * cell
    map_left = LEFT_X + (LEFT_W - map_w) / 2
    map_bottom = 187

    pdf.setFillColor(ROCK)
    pdf.setStrokeColor(ROCK_EDGE)
    pdf.setLineWidth(0.65)
    pdf.rect(map_left, map_bottom, map_w, map_h, fill=1, stroke=1)

    # Engraved hatching hugs the excavated walls, leaving quiet rock interiors.
    rng = random.Random(24)
    pdf.setStrokeColor(HexColor("#BBBBBB") if PRINTER else HexColor("#B5A17B"))
    pdf.setLineWidth(0.23)
    for r in range(rows):
        for co in range(cols):
            if grid[r * source_cols + co] in (1, 2):
                continue
            near = any(0 <= r+dr < rows and 0 <= co+dc < cols and grid[(r+dr)*source_cols+co+dc] in (1,2)
                       for dr in range(-2,3) for dc in range(-2,3))
            if near:
                xx = map_left + co*cell
                yy = map_bottom + (rows-r-1)*cell
                for j in range(3):
                    d = j*cell/3
                    pdf.line(xx+d, yy, xx+cell, yy+cell-d)
            elif rng.random() < .14:
                xx = map_left + (co+.5)*cell
                yy = map_bottom + (rows-r-.5)*cell
                pdf.circle(xx, yy, .22, fill=0, stroke=1)

    for row in range(rows):
        for col in range(cols):
            state = grid[row * source_cols + col]
            if state not in (1, 2):
                continue
            x = map_left + col * cell
            y = map_bottom + (rows - row - 1) * cell
            pdf.setFillColor(FLOOR if state == 1 else WATER)
            pdf.setStrokeColor(FLOOR_EDGE if state == 1 else (HexColor("#888888") if PRINTER else HexColor("#54879C")))
            pdf.setLineWidth(0.15)
            pdf.rect(x, y, cell, cell, fill=1, stroke=1)

    # Heavy exterior walls retain the exact source geometry.
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.65)
    for r in range(rows):
        for co in range(cols):
            if grid[r*source_cols+co] not in (1,2): continue
            xx=map_left+co*cell; yy=map_bottom+(rows-r-1)*cell
            for dr,dc,edge in [(-1,0,(xx,yy+cell,xx+cell,yy+cell)),(1,0,(xx,yy,xx+cell,yy)),(0,-1,(xx,yy,xx,yy+cell)),(0,1,(xx+cell,yy,xx+cell,yy+cell))]:
                nr,nc=r+dr,co+dc
                if not (0<=nr<rows and 0<=nc<cols) or grid[nr*source_cols+nc] not in (1,2): pdf.line(*edge)
    compass(pdf, map_left+map_w-43, map_bottom+map_h-47, 24)
    pdf.setFillColor(MID)
    pdf.setFont("Georgia-Italic", 7)


    special = {
        "DoorLocked1x1": ("L", LOCKED),
        "DoorSecret1x1": ("S", SECRET),
        "DoorRevolve1way1x1": (">", ONE_WAY),
    }
    for stamp in DATA.get("stamps", []):
        stamp_type = stamp.get("type", "")
        if stamp_type in special:
            x, y = project_top_down(stamp.get("col", 0), stamp.get("row", 0), map_left, map_bottom, cell, rows)
            mark, color = special[stamp_type]
            stamp_id = stamp.get("id", "")
            if stamp_type == "DoorLocked1x1" and stamp_id.startswith("generated-lock-cycle-1-"):
                mark = "6"
            elif stamp_type == "DoorLocked1x1" and stamp_id.startswith("generated-lock-cycle-5-"):
                mark = "20"
            pdf.setFillColor(PANEL if PRINTER else color)
            pdf.setStrokeColor(INK if PRINTER else PANEL)
            pdf.setLineWidth(0.55)
            pdf.circle(x, y, 3.7 if mark == "20" else 3.1, fill=1, stroke=1)
            pdf.setFillColor(INK if PRINTER else PANEL)
            pdf.setFont(FONT_BOLD, 3.8 if mark == "20" else 4.3)
            pdf.drawCentredString(x, y - 1.5, mark)
        # Key stamps in rooms 7 and 24 sit one grid cell from their number
        # labels. The ledger identifies the keys, so omit the redundant map
        # glyphs rather than crowding these small rooms.

    for label in DATA.get("labels", []):
        if not label.get("numberOnly") or not label.get("number"):
            continue
        x, y = project_top_down(label.get("col", 0), label.get("row", 0), map_left, map_bottom, cell, rows)
        radius = 5.0
        pdf.setFillColor(INK)
        pdf.setStrokeColor(FLOOR)
        pdf.setLineWidth(0.8)
        pdf.circle(x, y, radius, fill=1, stroke=1)
        pdf.setFillColor(PANEL)
        pdf.setFont(FONT_BOLD, 5.8)
        pdf.drawCentredString(x, y - 2.0, str(label["number"]))



def draw_north_arrow(pdf):
    x, y = LEFT_X + LEFT_W - 19, BODY_TOP - 17
    pdf.setFillColor(INK)
    pdf.setFont(FONT_BOLD, 7.4)
    pdf.drawCentredString(x, y + 11, "N")
    polygon(pdf, [(x, y + 8), (x + 4.5, y - 6), (x, y - 3), (x - 4.5, y - 6)], INK)
    pdf.setStrokeColor(ACCENT)
    pdf.setLineWidth(0.8)
    pdf.line(x, y - 5, x, y - 12)


def draw_map_legend(pdf, y):
    pdf.setFillColor(MID)
    pdf.setFont(FONT_BOLD, 6.2)
    pdf.drawString(LEFT_X + 5, y, "MAP KEY")
    items = [
        ("room", "#", INK),
        ("locked (6/20 keyed)", "L", LOCKED),
        ("secret", "S", SECRET),
        ("one-way", ">", ONE_WAY),
        ("water", "~", WATER),
    ]
    x = LEFT_X + 48
    for label, mark, color in items:
        pdf.setFillColor(INK if PRINTER else color)
        pdf.setFont(FONT_BOLD, 6.3)
        pdf.drawCentredString(x, y + 0.3, mark)
        pdf.setFillColor(MID)
        pdf.setFont(FONT_BODY, 5.9)
        pdf.drawString(x + 5, y + 0.3, label)
        x += stringWidth(label, FONT_BODY, 5.9) + 21


RUMORS = [
    "Flint-Tusk stole Red-Maw's drum. Bring it back and walk free.",
    "A hungry deserter hides in a feed trough. Supper buys secrets.",
    "Turn the upside-down banner and a challenger will come.",
    "The shrine's dead rise only while its bone circle holds.",
    "A prisoner in an iron cage knows a short way to the standard.",
    "Wipe a clan's name from the oath stone and its pact is broken.",
]


def draw_stats(pdf):
    bottom, height = 23, 146
    split = LEFT_X + 249
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(HAIR)
    pdf.setLineWidth(.65)
    pdf.rect(LEFT_X,bottom,LEFT_W,height,fill=1,stroke=1)
    pdf.line(split,bottom+9,split,bottom+height-9)
    pdf.setFillColor(INK);pdf.setFont(FONT_TITLE,9)
    pdf.drawString(LEFT_X+10,bottom+height-15,"Denizens of the Fang")
    pdf.setFillColor(ACCENT)
    pdf.drawString(split+10,bottom+height-15,"Whispers in the Pass")
    pdf.setFillColor(MID);pdf.setFont(FONT_BODY,6.5)
    pdf.drawString(LEFT_X+10,bottom+height-28,"All orcs: bonus action to rush 20 ft toward a foe.")
    pdf.drawString(split+10,bottom+height-28,"Roll d6 for a rumor. All are true.")
    stats = [
        ("Scout / runner / deserter", "AC 13  HP 11  |  axe +4 (1d8); flee at half HP"),
        ("Chainbreaker", "AC 14  HP 22  |  chain +5 (1d8); pull 10 ft"),
        ("Warden", "AC 12  HP 18  |  knife +4 (1d6); at 15, raise 1 skeleton/turn"),
        ("Captain / champion", "AC 15  HP 32  |  axe +5 (1d12); shout: ally +2 to hit"),
        ("Skeleton", "AC 12  HP 9  |  claw +4 (1d6)"),
        ("Cave goat", "AC 11  HP 10  |  horns +3 (1d6); charge adds 1d6"),
        ("Cave spirit", "AC 12  HP 18  |  touch +4 (1d6 CON damage); bound to circle"),
    ]
    for i,(name,rule) in enumerate(stats):
        x=LEFT_X+10; y=bottom+height-40-i*14.7
        pdf.setFillColor(INK);pdf.setFont(FONT_BOLD,7)
        pdf.drawString(x,y,name)
        pdf.setFillColor(MID);pdf.setFont(FONT_BODY,6.5)
        assert stringWidth(rule,FONT_BODY,6.5)<229
        pdf.drawString(x,y-7,rule)
    y=bottom+height-40
    for i,rumor in enumerate(RUMORS,1):
        pdf.setFillColor(ACCENT);pdf.setFont(FONT_BOLD,7.3)
        pdf.drawString(split+10,y,str(i))
        lines=wrap_text(rumor,FONT_BODY,7.1,LEFT_X+LEFT_W-split-32)
        pdf.setFillColor(INK);pdf.setFont(FONT_BODY,7.1)
        for line in lines:
            pdf.drawString(split+23,y,line)
            y-=8.0
        y-=1.0
    assert y >= bottom+3, f"Rumors overflow: {y}"


def draw_ledger(pdf):
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(HAIR)
    pdf.setLineWidth(0.8)
    pdf.rect(RIGHT_X, RIGHT_BOTTOM, LEDGER_W, BODY_TOP - RIGHT_BOTTOM, fill=1, stroke=1)
    pdf.setFillColor(INK if PRINTER else ACCENT)
    pdf.rect(RIGHT_X, BODY_TOP - 25, LEDGER_W, 25, fill=1, stroke=0)
    pdf.setFillColor(INK)
    pdf.setFont(FONT_TITLE, 10.0)
    pdf.setFillColor(HexColor("#FFFFFF") if PRINTER else PANEL)
    pdf.drawString(RIGHT_X + 11, BODY_TOP - 16, "Key to the Underhold")
    pdf.setFillColor(HexColor("#FFFFFF") if PRINTER else PANEL)
    pdf.setFont(FONT_BOLD, 6.4)
    pdf.drawRightString(RIGHT_X + LEDGER_W - 11, BODY_TOP - 15, "01-24")
    pdf.setStrokeColor(HAIR)
    pdf.line(RIGHT_X + 10, BODY_TOP - 23, RIGHT_X + LEDGER_W - 10, BODY_TOP - 23)

    start_y = BODY_TOP - 32
    available = start_y - (RIGHT_BOTTOM + 8)
    entries = DATA["roomLedgerEntries"]
    column_gap = 10
    column_w = (LEDGER_W - 22 - column_gap) / 2
    body_size, body_leading = 8.5, 9.4
    head_size, head_leading, entry_gap = 8.7, 10.1, 4.2

    def measure_columns():
        best = None
        for split in range(8, len(entries) - 7):
            groups = [entries[:split], entries[split:]]
            columns = [ledger_layout(group, body_size, body_leading, head_size, head_leading, entry_gap, column_w - 20) for group in groups]
            heights = [item[1] for item in columns]
            score = (max(heights), abs(heights[0] - heights[1]))
            if best is None or score < best[0]:
                best = (score, groups, columns, split)
        return best[1], best[2], best[3]

    groups, columns, split = measure_columns()
    while max(result[1] for result in columns) > available and body_size > 4.8:
        body_size -= 0.15
        body_leading = body_size + 0.6
        head_size = max(5.8, body_size + 0.7)
        head_leading = head_size + 0.8
        entry_gap = 0.65
        groups, columns, split = measure_columns()
    if max(result[1] for result in columns) > available:
        tallest = max(result[1] for result in columns)
        raise ValueError(f"Room ledger does not fit: needs {tallest:.1f}pt, has {available:.1f}pt")

    for col_idx, (measurements, height) in enumerate(columns):
        x = RIGHT_X + 11 + col_idx * (column_w + column_gap)
        text_x = x
        y = start_y
        for row_idx, (entry, wrapped_paragraphs, row_height) in enumerate(measurements):
            number = int(entry.get("number", row_idx + 1 + (split if col_idx else 0)))
            name = ROOM_DISPLAY_NAMES.get(number, ascii_text(entry.get("name", "Unnamed room")))
            pdf.setFillColor(ACCENT)
            pdf.setFont(FONT_BOLD, 7.0)
            pdf.drawString(text_x, y - head_size, f"{number:02d}")
            pdf.setFillColor(INK)
            pdf.setFont(FONT_BOLD, head_size)
            pdf.drawString(text_x + 18, y - head_size, name)
            y -= head_leading
            pdf.setFillColor(MID)
            pdf.setFont(FONT_BODY, body_size)
            for para_idx, lines in enumerate(wrapped_paragraphs):
                for line in lines:
                    pdf.drawString(text_x + 18, y - body_size, line)
                    y -= body_leading
                if para_idx + 1 < len(wrapped_paragraphs):
                    y -= 1.0
            y -= entry_gap
            if row_idx + 1 < len(measurements):
                pdf.setStrokeColor(HAIR)
                pdf.setLineWidth(0.35)
                pass  # Whitespace separates entries without crowding the last baseline.
        print(f"ledger column {col_idx + 1}: bottom={y:.1f}pt")
    pdf.setStrokeColor(HAIR)
    pdf.setLineWidth(0.45)
    divider_x = RIGHT_X + 11 + column_w + column_gap / 2
    pdf.line(divider_x, start_y + 2, divider_x, RIGHT_BOTTOM + 8)
    print(f"ledger split={split}; font={body_size:.2f}pt; available bottom={RIGHT_BOTTOM + 8:.1f}pt")


pdfmetrics.registerFont(TTFont("Georgia-Italic", "C:/Windows/Fonts/georgiai.ttf"))


def compass(pdf, x, y, size):
    pdf.setStrokeColor(ACCENT)
    pdf.setLineWidth(.5)
    pdf.circle(x,y,size*.68,stroke=1,fill=0)
    pdf.circle(x,y,size*.76,stroke=1,fill=0)
    for i in range(8):
        a=i*math.pi/4
        length=size if i%2==0 else size*.64
        tip=(x+math.sin(a)*length,y+math.cos(a)*length)
        left=(x+math.sin(a-.55)*size*.18,y+math.cos(a-.55)*size*.18)
        right=(x+math.sin(a+.55)*size*.18,y+math.cos(a+.55)*size*.18)
        polygon(pdf,[(x,y),left,tip],INK)
        polygon(pdf,[(x,y),right,tip],PANEL,INK,.35)
    pdf.setFillColor(INK); pdf.setFont(FONT_TITLE,7)
    pdf.drawCentredString(x,y+size+5,"N")


def crest(pdf,x,y):
    # A split crown and paired curved tusks, drawn as crisp vector artwork.
    pdf.setStrokeColor(ACCENT); pdf.setLineWidth(.8)
    pdf.circle(x,y,24,stroke=1,fill=0)
    polygon(pdf,[(x-12,y+4),(x-16,y+18),(x-5,y+12),(x,y+22),(x+5,y+12),(x+16,y+18),(x+12,y+4)],ACCENT)
    for side in [-1,1]:
        p=pdf.beginPath();p.moveTo(x+side*16,y+1)
        p.curveTo(x+side*19,y-12,x+side*9,y-22,x+side*2,y-25)
        p.curveTo(x+side*9,y-13,x+side*9,y-5,x+side*7,y+1)
        p.close();pdf.setFillColor(PANEL);pdf.setStrokeColor(INK);pdf.setLineWidth(.65);pdf.drawPath(p,fill=1,stroke=1 if PRINTER else 0)
    polygon(pdf,[(x,y+6),(x+4,y-1),(x,y-8),(x-4,y-1)],ACCENT)


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=landscape(A4), pageCompression=1)
    pdf.setTitle("Orc Underhold")
    pdf.setAuthor("Torch & Tile")
    pdf.setFillColor(BG);pdf.rect(0,0,PAGE_W,PAGE_H,fill=1,stroke=0)
    if not PRINTER:
        rng=random.Random(7)
        pdf.setFillColor(HexColor("#DDCBA7"))
        for _ in range(6200):
            pdf.circle(rng.uniform(9,PAGE_W-9),rng.uniform(9,PAGE_H-9),rng.uniform(.07,.28),fill=1,stroke=0)
    for inset in [9,12]:
        pdf.setStrokeColor(ACCENT);pdf.setLineWidth(.5 if inset==9 else .25)
        pdf.rect(inset,inset,PAGE_W-2*inset,PAGE_H-2*inset,stroke=1,fill=0)
    for x in [12,PAGE_W-12]:
        for y in [12,PAGE_H-12]:
            polygon(pdf,[(x,y+4),(x+4,y),(x,y-4),(x-4,y)],ACCENT)
    pdf.setFillColor(PANEL if PRINTER else INK)
    pdf.rect(MARGIN,PAGE_H-72,PAGE_W-2*MARGIN,50,fill=1,stroke=0)
    crest(pdf,MARGIN+32,PAGE_H-44)
    pdf.setFillColor(INK if PRINTER else PANEL)
    pdf.setFont(FONT_TITLE,24)
    pdf.drawString(MARGIN+69,PAGE_H-45,"Orc Underhold")
    pdf.setFont(FONT_BOLD,7.5)
    pdf.drawRightString(PAGE_W-MARGIN-12,PAGE_H-40,"LEVELS 1-3")
    pdf.setFont("Georgia-Italic",7.5)
    pdf.drawRightString(PAGE_W-MARGIN-12,PAGE_H-55,"At dusk, Split-Crown unites the clans. Steal or burn its war standard in 23 to sabotage the pact.")
    draw_top_down_map(pdf)
    draw_map_legend(pdf,176)
    draw_stats(pdf)
    draw_ledger(pdf)
    pdf.setFillColor(MID);pdf.setFont(FONT_BOLD,5)
    pdf.showPage();pdf.save();print(OUTPUT)


if __name__ == "__main__":
    main()

