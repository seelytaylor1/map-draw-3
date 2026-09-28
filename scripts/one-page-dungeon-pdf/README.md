# One-page dungeon PDF

`build_orc_fang_a4.py` lays out a Torch & Tile dungeon JSON export as a landscape A4 folio. It creates a color version and, with `--printer`, a black-and-white version. The room copy, monster notes, and visual theme are currently written for the Orc Fang Mountains example.

The source JSON is supplied separately and is not included in this repository. The builder requires Python 3, ReportLab, and the Arial and Georgia fonts installed at `C:\Windows\Fonts`. Install ReportLab with `python -m pip install reportlab` if needed.

From the repository root, run:

```powershell
python scripts/one-page-dungeon-pdf/build_orc_fang_a4.py --source path\to\dungeon.json
python scripts/one-page-dungeon-pdf/build_orc_fang_a4.py --source path\to\dungeon.json --printer
```

By default, PDFs are written to the ignored `dist/one-page-dungeon-pdf/` directory. Pass `--output-dir path` to choose another destination.
