# Dynamic Certificate Generator (Approach 1)

This tool lets you use **any certificate template image** (PNG or JPG) and replace/overlay dynamic text (Recipient Name, Event, Date, ID, QR code, etc.) without having to change the code.

---

## 📁 Files Included

- `generate.py`: Main script to generate certificates (single or bulk from CSV) as PDF or PNG.
- `template_config.json`: Configuration defining templates and their text field positions `(x, y)`, font sizes, colors, and QR code settings.
- `pick_coordinates.py`: Interactive GUI tool that lets you click anywhere on any template to find its exact `(X, Y)` coordinates.
- `sample_recipients.csv`: Sample CSV file for bulk generation.
- `output_certificates/`: Folder where generated certificates are saved.

---

## 🚀 Quick Start

### 1. Generate a Single Certificate
```bash
# Basic single certificate
python scripts/certificate_generator/generate.py --name "Alex Johnson" --event "BitByBit Hackathon" --date "November 2026"

# Specify custom output format (png or pdf)
python scripts/certificate_generator/generate.py --name "Alex Johnson" --format png
```

### 2. Bulk Generate from a CSV File
Create a CSV file with columns like `name`, `event`, `achievement`, `date`, `cert_id` (see `sample_recipients.csv`):

```bash
python scripts/certificate_generator/generate.py --csv scripts/certificate_generator/sample_recipients.csv --format pdf
```

---

## 🎨 How to Use a New / Custom Certificate Template

### Step 1: Find the Coordinates with the Coordinate Picker
Whenever you have a new template image (`my_new_template.png`), run:

```bash
python scripts/certificate_generator/pick_coordinates.py --image path/to/my_new_template.png
```

- A window will pop up showing your template.
- Hover your mouse or click anywhere (e.g. where the student's name goes).
- The exact coordinate `X` and `Y` will be printed in your terminal and copied to your clipboard!

---

### Step 2: Add or Edit the Template in `template_config.json`

Open `template_config.json` and add your profile:

```json
{
  "my_custom_template": {
    "template_image": "path/to/my_new_template.png",
    "fields": {
      "recipient_name": {
        "x": "center",
        "y": 420,
        "font": "timesbd.ttf",
        "font_size": 48,
        "color": "#111827",
        "align": "center"
      },
      "body_text": {
        "x": "center",
        "y": 510,
        "font": "arial.ttf",
        "font_size": 18,
        "color": "#374151",
        "align": "center",
        "max_width": 800
      },
      "date": {
        "x": 250,
        "y": 700,
        "font": "arial.ttf",
        "font_size": 14,
        "color": "#4b5563"
      },
      "cert_id": {
        "x": 80,
        "y": 750,
        "font": "couri.ttf",
        "font_size": 12,
        "color": "#6b7280"
      }
    },
    "qr_code": {
      "enabled": true,
      "x": 900,
      "y": 680,
      "size": 75,
      "label": "Scan to Verify"
    }
  }
}
```

Then run with `--profile my_custom_template`:
```bash
python scripts/certificate_generator/generate.py --profile my_custom_template --name "Alex Johnson"
```

---

## ⚙️ Options & Parameters

| Flag | Default | Description |
|---|---|---|
| `--name` | Interactive prompt | Recipient full name |
| `--event` | BitByBit Contest | Event or competition title |
| `--achievement` | securing 1st Place | Reason or placement text |
| `--date` | Current month/year | Date string printed on certificate |
| `--id` | Auto-generated UUID | Unique certificate ID (e.g. `BBB-2026-WIN01`) |
| `--qr-url` | `https://bitbybit.club/certificate/{id}` | URL encoded in verification QR code |
| `--csv` | `None` | Path to CSV for batch generation |
| `--format` | `pdf` | Output format: `pdf` or `png` |
| `--outdir` | `output_certificates` | Destination folder |
| `--profile` | `default` | Configuration profile from `template_config.json` |

