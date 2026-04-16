from PIL import Image, ImageDraw, ImageFont


W, H = 1600, 980
BG = "#0f1122"
PANEL = "#181b33"
PANEL2 = "#1d2140"
LINE = (138, 162, 222, 36)
LINE_SOFT = (138, 162, 222, 22)
TEXT = "#dbe4ff"
MUTED = "#8d9ac2"
ACCENT = "#64ffda"
BUSY = "#ffcf56"
OFF = "#ff6b77"


def font(size, bold=False):
    path = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    if bold:
        alt = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
        try:
            return ImageFont.truetype(alt, size)
        except Exception:
            pass
    return ImageFont.truetype(path, size)


img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img)

# top gradient-ish bands
draw.rectangle((0, 0, W, 240), fill="#1c2144")
draw.rectangle((0, 160, W, H), fill=BG)

frame = (40, 40, W - 40, H - 40)
draw.rounded_rectangle(frame, 24, fill=(24, 27, 51, 245), outline=(130, 154, 222, 40), width=2)

brand_font = font(34, bold=True)
chip_font = font(20)
small_font = font(16)
tiny_font = font(13)
time_font = font(17, bold=True)
master_font = font(18, bold=True)
date_font = font(54, bold=True)
weekday_font = font(22, bold=True)
card_title = font(16, bold=True)
card_text = font(13)

draw.text((74, 76), "❄ CRM SPLIT SERVICE", fill=ACCENT, font=brand_font)

chips = ["Владелец", "Апрель 2026", "Часовая сетка"]
x = 1080
for label in chips:
    bbox = draw.textbbox((0, 0), label, font=chip_font)
    w = bbox[2] - bbox[0] + 36
    draw.rounded_rectangle((x, 72, x + w, 110), 14, fill=(255, 255, 255, 10), outline=(255, 255, 255, 18), width=1)
    draw.text((x + 18, 82), label, fill=TEXT, font=chip_font)
    x += w + 12

draw.text((74, 136), "Вариант таблицы с шагом 1 час, где заявка на 2 часа выглядит как одна объединённая карточка.", fill="#b9c5eb", font=chip_font)

legend = [
    (ACCENT, "свободный слот"),
    (BUSY, "мастер пометил «занят»"),
    (OFF, "выходной"),
    ("#d7efcd", "2-часовая заявка"),
]
x = 74
for color, label in legend:
    bbox = draw.textbbox((0, 0), label, font=small_font)
    w = bbox[2] - bbox[0] + 48
    draw.rounded_rectangle((x, 180, x + w, 214), 12, fill=(255, 255, 255, 10), outline=(255, 255, 255, 18), width=1)
    draw.ellipse((x + 12, 191, x + 24, 203), fill=color)
    draw.text((x + 32, 186), label, fill="#cad4f6", font=small_font)
    x += w + 10

grid_x = 60
grid_y = 250
date_w = 120
master_w = 210
slot_w = 100
head_h = 54
row_h = 92
slots = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"]

total_w = date_w + master_w + len(slots) * slot_w
draw.rectangle((grid_x, grid_y, grid_x + total_w, grid_y + head_h), fill="#12162c")

def cell(x1, y1, x2, y2, fill=None, outline=LINE):
    draw.rectangle((x1, y1, x2, y2), fill=fill, outline=outline, width=1)

cell(grid_x, grid_y, grid_x + date_w, grid_y + head_h, fill="#12162c")
cell(grid_x + date_w, grid_y, grid_x + date_w + master_w, grid_y + head_h, fill="#12162c")
draw.text((grid_x + 18, grid_y + 16), "ДАТА", fill="#8392bf", font=time_font)
draw.text((grid_x + date_w + 26, grid_y + 16), "МАСТЕР", fill="#8392bf", font=time_font)

for i, t in enumerate(slots):
    x1 = grid_x + date_w + master_w + i * slot_w
    cell(x1, grid_y, x1 + slot_w, grid_y + head_h, fill="#12162c")
    bbox = draw.textbbox((0, 0), t, font=time_font)
    tw = bbox[2] - bbox[0]
    draw.text((x1 + (slot_w - tw) / 2, grid_y + 16), t, fill=ACCENT, font=time_font)

body_y = grid_y + head_h

def draw_plus_slot(x1, y1, x2, y2):
    cell(x1, y1, x2, y2, fill="#101325", outline=LINE_SOFT)
    bbox = draw.textbbox((0, 0), "+", font=font(28))
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x1 + (x2 - x1 - tw) / 2, y1 + (y2 - y1 - th) / 2 - 3), "+", fill=(168, 183, 227, 60), font=font(28))

def draw_busy_slot(x1, y1, x2, y2):
    cell(x1, y1, x2, y2, fill="#101325", outline=LINE_SOFT)
    box = (x1 + 10, y1 + 10, x2 - 10, y2 - 10)
    draw.rounded_rectangle(box, 14, outline=(255, 207, 86, 120), width=2)
    # pseudo-dashed border
    for xx in range(int(box[0]) + 6, int(box[2]) - 6, 14):
        draw.line((xx, box[1], min(xx + 7, box[2]), box[1]), fill=(255, 207, 86, 190), width=2)
        draw.line((xx, box[3], min(xx + 7, box[2]), box[3]), fill=(255, 207, 86, 190), width=2)
    for yy in range(int(box[1]) + 6, int(box[3]) - 6, 14):
        draw.line((box[0], yy, box[0], min(yy + 7, box[3])), fill=(255, 207, 86, 190), width=2)
        draw.line((box[2], yy, box[2], min(yy + 7, box[3])), fill=(255, 207, 86, 190), width=2)
    bbox = draw.textbbox((0, 0), "занят", font=font(16, bold=True))
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x1 + (x2 - x1 - tw) / 2, y1 + (y2 - y1 - th) / 2), "занят", fill=BUSY, font=font(16, bold=True))

def draw_off_slot(x1, y1, x2, y2):
    cell(x1, y1, x2, y2, fill="#231b2a", outline=LINE_SOFT)
    step = 18
    for sx in range(int(x1) - 80, int(x2) + 80, step):
        draw.line((sx, y2, sx + 80, y1), fill=(255, 107, 119, 64), width=10)
    bbox = draw.textbbox((0, 0), "выходн.", font=font(14, bold=True))
    tw = bbox[2] - bbox[0]
    draw.text((x1 + (x2 - x1 - tw) / 2, y1 + 34), "выходн.", fill="#d9afba", font=font(14, bold=True))

def draw_order(x1, y1, hours, title, line1, line2, fill):
    x2 = x1 + hours * slot_w - 8
    card = (x1 + 8, y1 + 8, x2, y1 + row_h - 8)
    draw.rounded_rectangle(card, 14, fill=fill)
    draw.text((card[0] + 12, card[1] + 10), title, fill="#243247", font=card_title)
    draw.text((card[0] + 12, card[1] + 34), line1, fill="#4d5a74", font=card_text)
    draw.text((card[0] + 12, card[1] + 52), line2, fill="#4d5a74", font=card_text)

rows = [
    ("9", "Чт", ("А", "#71c4ff", "Алексей Друж.", "Ростов-на-Дону")),
    (None, None, ("Д", "#bfe279", "Дмитрий", "Ростов-на-Дону")),
    (None, None, ("Г", "#ffc75c", "Гриша", "Ростов-на-Дону")),
]

for idx, row in enumerate(rows):
    y1 = body_y + idx * row_h
    y2 = y1 + row_h
    if idx == 0:
        cell(grid_x, y1, grid_x + date_w, y1 + row_h * 3, fill=(255, 255, 255, 3), outline=LINE)
        draw.text((grid_x + 42, y1 + 36), row[0], fill="white", font=date_font)
        draw.text((grid_x + 42, y1 + 95), row[1], fill="#95a7d6", font=weekday_font)
    cell(grid_x + date_w, y1, grid_x + date_w + master_w, y2, fill=(255, 255, 255, 3), outline=LINE_SOFT)
    av_letter, av_color, m_name, m_city = row[2]
    draw.ellipse((grid_x + date_w + 14, y1 + 28, grid_x + date_w + 48, y1 + 62), fill=av_color)
    draw.text((grid_x + date_w + 25, y1 + 33), av_letter, fill="#21314a", font=font(18, bold=True))
    draw.text((grid_x + date_w + 62, y1 + 28), m_name, fill=TEXT, font=master_font)
    draw.text((grid_x + date_w + 62, y1 + 52), m_city, fill=MUTED, font=tiny_font)
    for i in range(len(slots)):
        x1 = grid_x + date_w + master_w + i * slot_w
        x2 = x1 + slot_w
        draw_plus_slot(x1, y1, x2, y2)

# overlays/orders
y1 = body_y
x10 = grid_x + date_w + master_w + 2 * slot_w
draw_order(x10, y1, 2, "Чистка сплит-системы", "Мария · Текучёва, 21", "10:00–12:00 · 2 часа", "#d7efcd")
draw_busy_slot(grid_x + date_w + master_w + 4 * slot_w, y1, grid_x + date_w + master_w + 5 * slot_w, y1 + row_h)
draw_off_slot(grid_x + date_w + master_w + 8 * slot_w, y1, grid_x + date_w + master_w + 9 * slot_w, y1 + row_h)
draw_off_slot(grid_x + date_w + master_w + 9 * slot_w, y1, grid_x + date_w + master_w + 10 * slot_w, y1 + row_h)

y2row = body_y + row_h
draw_order(grid_x + date_w + master_w + 4 * slot_w, y2row, 3, "Монтаж трассы", "Евгения · Центр", "12:00–15:00 · 3 часа", "#ffd7df")
draw_busy_slot(grid_x + date_w + master_w + 11 * slot_w, y2row, grid_x + date_w + master_w + 12 * slot_w, y2row + row_h)

y3 = body_y + row_h * 2
draw_order(grid_x + date_w + master_w + 1 * slot_w, y3, 2, "Диагностика", "Ирина · Промышленный", "09:00–11:00 · 2 часа", "#f2d4ff")
draw_busy_slot(grid_x + date_w + master_w + 5 * slot_w, y3, grid_x + date_w + master_w + 6 * slot_w, y3 + row_h)

draw.text((74, 900), "Идея: старт выбирается по часу, а длительность 2-3 часа просто растягивает один блок на соседние слоты.", fill="#93a4d2", font=small_font)

out = "/Users/swift/Desktop/CRM v2/mockups/hourly-schedule-mockup.png"
img.convert("RGB").save(out, quality=95)
print(out)
