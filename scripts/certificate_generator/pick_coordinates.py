#!/usr/bin/env python3
"""
Interactive Coordinate Picker for Certificate Templates.

Click anywhere on your certificate template image to get exact (X, Y) coordinates,
preview text placement, and copy ready-to-use JSON config snippets!

Usage:
    python pick_coordinates.py
    python pick_coordinates.py --image path/to/my_template.png
"""

import sys
import os
import argparse
import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageTk

# Set UTF-8 encoding for Windows consoles
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


class CoordinatePickerApp:
    def __init__(self, root, image_path):
        self.root = root
        self.root.title("Certificate Coordinate Picker - Click anywhere to find (X, Y)")
        self.image_path = image_path

        if not os.path.exists(image_path):
            messagebox.showerror("Error", f"Image not found:\n{image_path}")
            sys.exit(1)

        self.orig_img = Image.open(image_path)
        self.orig_w, self.orig_h = self.orig_img.size

        # Fit image to screen if larger than screen bounds (max 1200x800 preview)
        max_w, max_h = 1100, 700
        self.scale = min(max_w / self.orig_w, max_h / self.orig_h, 1.0)
        self.display_w = int(self.orig_w * self.scale)
        self.display_h = int(self.orig_h * self.scale)

        self.preview_img = self.orig_img.resize((self.display_w, self.display_h), Image.Resampling.LANCZOS)
        self.tk_img = ImageTk.PhotoImage(self.preview_img)

        # Top Control / Info Bar
        top_bar = tk.Frame(root, bg="#1e293b", pady=8, padx=12)
        top_bar.pack(fill=tk.X)

        self.info_label = tk.Label(
            top_bar,
            text=f"Template: {os.path.basename(image_path)} ({self.orig_w}x{self.orig_h}) | Click anywhere on the certificate to get coordinates",
            fg="#f8fafc",
            bg="#1e293b",
            font=("Arial", 11, "bold")
        )
        self.info_label.pack(side=tk.LEFT)

        # Canvas for Certificate Image
        self.canvas = tk.Canvas(root, width=self.display_w, height=self.display_h, cursor="crosshair")
        self.canvas.pack()
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.tk_img)

        # Bind events
        self.canvas.bind("<Motion>", self.on_mouse_move)
        self.canvas.bind("<Button-1>", self.on_click)

        # Bottom status bar
        self.status_bar = tk.Label(
            root,
            text="Hover over image to see coordinates. Click to copy coordinate snippet.",
            bd=1,
            relief=tk.SUNKEN,
            anchor=tk.W,
            padx=10,
            pady=6,
            font=("Consolas", 10),
            bg="#f1f5f9"
        )
        self.status_bar.pack(fill=tk.X)

        self.marker_id = None

    def on_mouse_move(self, event):
        actual_x = int(event.x / self.scale)
        actual_y = int(event.y / self.scale)
        self.status_bar.config(
            text=f"Cursor: X = {actual_x} px, Y = {actual_y} px  |  (Original Image: {self.orig_w} x {self.orig_h})"
        )

    def on_click(self, event):
        actual_x = int(event.x / self.scale)
        actual_y = int(event.y / self.scale)

        # Draw red dot marker
        r = 4
        if self.marker_id:
            self.canvas.delete(self.marker_id)
        self.marker_id = self.canvas.create_oval(
            event.x - r, event.y - r, event.x + r, event.y + r,
            fill="#ef4444", outline="#ffffff", width=2
        )

        snippet = f'"x": {actual_x}, "y": {actual_y}'
        center_snippet = f'"x": "center", "y": {actual_y}'

        print("\n" + "="*50)
        print(f"🎯 CLICKED COORDINATE:")
        print(f"   X: {actual_x} px,  Y: {actual_y} px")
        print(f"   Center-aligned snippet:  {center_snippet}")
        print(f"   Exact-position snippet:  {snippet}")
        print("="*50)

        # Copy to clipboard
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(center_snippet)
        except Exception:
            pass

        self.status_bar.config(
            text=f"✅ Copied to clipboard! X={actual_x}, Y={actual_y} -> {center_snippet}"
        )


def main():
    parser = argparse.ArgumentParser(description="Interactive Certificate Coordinate Picker")
    parser.add_argument(
        "--image",
        type=str,
        default=os.path.join(os.path.dirname(__file__), "../../public/certificates/certificate-base.png"),
        help="Path to certificate template image"
    )
    args = parser.parse_args()

    root = tk.Tk()
    app = CoordinatePickerApp(root, os.path.abspath(args.image))
    root.mainloop()


if __name__ == "__main__":
    main()
