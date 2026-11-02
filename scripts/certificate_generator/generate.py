#!/usr/bin/env python3
"""
Dynamic Certificate Generator
Approach 1: Configurable Coordinate & Text Replacement over any Certificate Template Image.

Usage:
  # 1. Single Certificate:
  python generate.py --name "Alex Johnson" --event "BitByBit Hackathon" --date "November 2026"

  # 2. Bulk Generation from CSV:
  python generate.py --csv sample_recipients.csv

  # 3. Custom Template / Config profile:
  python generate.py --template path/to/template.png --name "Jane Doe" --profile default
"""

import os
import sys
import json
import csv
import uuid
import argparse
from typing import Dict, Any, List, Optional
from PIL import Image, ImageDraw, ImageFont

# Set UTF-8 encoding for Windows consoles
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import qrcode
    QR_AVAILABLE = True
except ImportError:
    QR_AVAILABLE = False


def find_font(font_name: str, font_size: int) -> ImageFont.FreeTypeFont:
    """Finds a font in common system directories or local directory."""
    search_paths = [
        font_name,
        os.path.join(os.path.dirname(__file__), "fonts", font_name),
        os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts", font_name),
    ]

    # Map friendly names to Windows filenames if not ending in .ttf
    fallback_map = {
        "arial": "arial.ttf",
        "arial_bold": "arialbd.ttf",
        "times": "times.ttf",
        "times_bold": "timesbd.ttf",
        "times_italic": "timesi.ttf",
        "courier": "cour.ttf",
        "courier_bold": "courbd.ttf",
        "georgia": "georgia.ttf",
        "georgia_bold": "georgiab.ttf"
    }

    if font_name.lower() in fallback_map:
        mapped = fallback_map[font_name.lower()]
        search_paths.append(os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts", mapped))

    for path in search_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                continue

    # Fallback to default
    print(f"⚠️  Font '{font_name}' not found. Falling back to default font.")
    try:
        return ImageFont.load_default()
    except Exception:
        return None


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw) -> List[str]:
    """Wraps text so no line exceeds max_width."""
    words = text.split()
    if not words:
        return []

    lines = []
    current_line = []

    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [word]

    if current_line:
        lines.append(" ".join(current_line))

    return lines


def generate_single_certificate(
    template_path: str,
    output_path: str,
    field_data: Dict[str, str],
    config: Dict[str, Any],
    output_format: str = "pdf",
    verification_url: Optional[str] = None
) -> str:
    """Generates a single certificate given a template image and field configurations."""
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template image not found: {template_path}")

    # Open base image
    base_image = Image.open(template_path).convert("RGBA")
    width, height = base_image.size

    # Create overlay drawing context
    draw = ImageDraw.Draw(base_image)

    fields_config = config.get("fields", {})

    for field_key, field_cfg in fields_config.items():
        text = field_data.get(field_key, "")
        if not text:
            continue

        font_name = field_cfg.get("font", "arial.ttf")
        font_size = field_cfg.get("font_size", 24)
        color = field_cfg.get("color", "#000000")
        align = field_cfg.get("align", "center")
        pos_x = field_cfg.get("x", "center")
        pos_y = field_cfg.get("y", 100)
        max_width = field_cfg.get("max_width", None)
        line_spacing = field_cfg.get("line_spacing", 4)

        font = find_font(font_name, font_size)

        # Handle multiline wrapping if max_width is provided
        if max_width and max_width > 0:
            lines = wrap_text(str(text), font, max_width, draw)
        else:
            lines = str(text).split("\n")

        curr_y = pos_y
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            line_w = bbox[2] - bbox[0]
            line_h = bbox[3] - bbox[1]

            if pos_x == "center" or align == "center":
                draw_x = (width - line_w) // 2
            elif align == "right":
                draw_x = int(pos_x) - line_w
            else:
                draw_x = int(pos_x)

            draw.text((draw_x, curr_y), line, font=font, fill=color)
            curr_y += line_h + line_spacing

    # Handle QR Code
    qr_cfg = config.get("qr_code", {})
    if qr_cfg.get("enabled", False) and verification_url and QR_AVAILABLE:
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=4,
                border=1,
            )
            qr.add_data(verification_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="#111111", back_color="#FFFFFF").convert("RGBA")

            size = qr_cfg.get("size", 80)
            qr_img = qr_img.resize((size, size), Image.Resampling.LANCZOS)

            qx = qr_cfg.get("x", width - size - 40)
            qy = qr_cfg.get("y", height - size - 40)
            base_image.paste(qr_img, (qx, qy), qr_img)

            # Optional label below QR
            label = qr_cfg.get("label")
            if label:
                lbl_font_size = qr_cfg.get("label_font_size", 9)
                lbl_color = qr_cfg.get("label_color", "#555555")
                lbl_font = find_font("arial.ttf", lbl_font_size)
                lbl_bbox = draw.textbbox((0, 0), label, font=lbl_font)
                lbl_w = lbl_bbox[2] - lbl_bbox[0]
                lbl_x = qx + (size - lbl_w) // 2
                lbl_y = qy + size + 2
                draw.text((lbl_x, lbl_y), label, font=lbl_font, fill=lbl_color)
        except Exception as e:
            print(f"⚠️ Failed to generate QR code: {e}")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Save output
    rgb_image = base_image.convert("RGB")
    ext = os.path.splitext(output_path)[1].lower()

    if output_format.lower() == "pdf" or ext == ".pdf":
        if not output_path.endswith(".pdf"):
            output_path += ".pdf"
        rgb_image.save(output_path, "PDF", resolution=300.0)
    else:
        if not output_path.endswith(".png"):
            output_path += ".png"
        rgb_image.save(output_path, "PNG")

    return output_path


def load_config(config_path: str, profile: str = "default") -> Dict[str, Any]:
    """Loads configuration JSON file."""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if profile not in data:
        raise KeyError(f"Profile '{profile}' not found in {config_path}. Available profiles: {list(data.keys())}")
    return data[profile]


def main():
    parser = argparse.ArgumentParser(
        description="Dynamic Certificate Generator (Approach 1: Template + Coordinate Replacement)"
    )
    parser.add_argument("--template", type=str, default=None, help="Path to template image (PNG/JPG)")
    parser.add_argument("--config", type=str, default="template_config.json", help="Path to configuration JSON")
    parser.add_argument("--profile", type=str, default="default", help="Config profile name to use")
    parser.add_argument("--outdir", type=str, default="output_certificates", help="Directory to save generated certificates")
    parser.add_argument("--format", type=str, choices=["pdf", "png"], default="pdf", help="Output format (pdf or png)")

    # Single Mode Arguments
    parser.add_argument("--name", type=str, default=None, help="Recipient Name")
    parser.add_argument("--event", type=str, default="BitByBit Weekly Contest", help="Event Name")
    parser.add_argument("--achievement", type=str, default="securing 1st Place", help="Achievement or Reason")
    parser.add_argument("--date", type=str, default=None, help="Certificate Date string")
    parser.add_argument("--id", type=str, default=None, help="Certificate ID")
    parser.add_argument("--qr-url", type=str, default=None, help="Verification URL to embed in QR code")

    # Bulk Mode Argument
    parser.add_argument("--csv", type=str, default=None, help="Path to CSV file for bulk generation")

    args = parser.parse_args()

    # Resolve config path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = args.config if os.path.isabs(args.config) else os.path.join(script_dir, args.config)
    cfg = load_config(config_file, profile=args.profile)

    # Resolve template path
    template_img = args.template
    if not template_img:
        cfg_template = cfg.get("template_image", "../../public/certificates/certificate-base.png")
        template_img = cfg_template if os.path.isabs(cfg_template) else os.path.normpath(os.path.join(script_dir, cfg_template))

    if not os.path.exists(template_img):
        print(f"❌ Error: Template image does not exist: {template_img}")
        sys.exit(1)

    out_dir = args.outdir if os.path.isabs(args.outdir) else os.path.join(script_dir, args.outdir)
    os.makedirs(out_dir, exist_ok=True)

    # 1. Bulk generation mode
    if args.csv:
        csv_path = args.csv if os.path.isabs(args.csv) else os.path.join(script_dir, args.csv)
        if not os.path.exists(csv_path):
            print(f"❌ CSV file not found: {csv_path}")
            sys.exit(1)

        print(f"🚀 Starting bulk certificate generation from: {csv_path}")
        with open(csv_path, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            count = 0
            for idx, row in enumerate(reader, start=1):
                name = row.get("name") or row.get("recipient_name") or f"Participant_{idx}"
                cert_id = row.get("cert_id") or row.get("id") or f"BBB-2026-{uuid.uuid4().hex[:6].upper()}"
                event = row.get("event") or "BitByBit Weekly Contest"
                achievement = row.get("achievement") or "securing top rank"
                date_str = row.get("date") or "November 2026"

                # Compose body text if not explicitly provided
                body = row.get("body_text")
                if not body:
                    body = f"from teamcodelocked club in recognition of {achievement} for the {event} ORGANISED IN {date_str.upper()}"

                act_points = row.get("activity_points") or "This certificate is eligible for claiming 1-2 activity points."

                verify_url = row.get("qr_url") or f"https://bitbybit.club/certificate/{cert_id}"

                field_data = {
                    "recipient_name": name,
                    "body_text": body,
                    "activity_points": act_points,
                    "date": f"Date: {date_str}",
                    "cert_id": f"ID: {cert_id}",
                    **row # Include any extra custom fields from CSV!
                }

                clean_filename = "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).rstrip()
                clean_filename = clean_filename.replace(" ", "_")
                filename = f"{clean_filename}_{cert_id}.{args.format}"
                out_path = os.path.join(out_dir, filename)

                generate_single_certificate(
                    template_path=template_img,
                    output_path=out_path,
                    field_data=field_data,
                    config=cfg,
                    output_format=args.format,
                    verification_url=verify_url
                )
                print(f"  [{idx}] Generated: {filename}")
                count += 1

        print(f"\n🎉 Successfully generated {count} certificate(s) in: {out_dir}")
        return

    # 2. Single generation mode
    recipient = args.name or input("Enter Recipient Name: ").strip()
    if not recipient:
        print("❌ Recipient name is required.")
        sys.exit(1)

    cert_id = args.id or f"BBB-2026-{uuid.uuid4().hex[:6].upper()}"
    date_val = args.date or "November 2026"
    event_val = args.event
    achieve_val = args.achievement
    verify_url = args.qr_url or f"https://bitbybit.club/certificate/{cert_id}"

    body_text = f"from teamcodelocked club in recognition of {achieve_val} for the {event_val} ORGANISED IN {date_val.upper()}"
    act_text = "This certificate is eligible for claiming 1-2 activity points."

    field_data = {
        "recipient_name": recipient,
        "body_text": body_text,
        "activity_points": act_text,
        "date": f"Date: {date_val}",
        "cert_id": f"ID: {cert_id}"
    }

    clean_filename = "".join(c for c in recipient if c.isalnum() or c in (" ", "_", "-")).rstrip().replace(" ", "_")
    out_file = os.path.join(out_dir, f"{clean_filename}_{cert_id}.{args.format}")

    generated = generate_single_certificate(
        template_path=template_img,
        output_path=out_file,
        field_data=field_data,
        config=cfg,
        output_format=args.format,
        verification_url=verify_url
    )

    print(f"\n✅ Certificate generated successfully:")
    print(f"   📄 File: {generated}")
    print(f"   👤 Name: {recipient}")
    print(f"   🆔 ID:   {cert_id}")
    print(f"   🔗 QR:   {verify_url}")


if __name__ == "__main__":
    main()
