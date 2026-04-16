from PIL import Image, ImageDraw, ImageFont


W, H = 1860, 1560
BG = "#0d1020"
PANEL = "#151935"
PANEL2 = "#1d2347"
GRID = "#0f1328"
LINE = (129, 147, 210, 34)
LINE_SOFT = (129, 147, 210, 18)
TEXT = "#dce4ff"
MUTED = "#8f9cc3"
ACCENT = "#6afbe3"
YELLOW = "#ffd462"
RED = "#ff6f7f"
GREEN = "#d8efcc"
PINK = "#ffd9df"
VIOLET = "#f0d7ff"


def font(size, bold=False):
    if bold:
        for path in (
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", size)


def text(draw, xy, value, fill, size, bold=False, anchor=None):
    draw.text(xy, value, fill=fill, font=font(size, bold=bold), anchor=anchor)


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)


def draw_busy(draw, box):
    rounded(draw, box, 14, fill=GRID, outline=(255, 212, 98, 170), width=2)
    x1, y1, x2, y2 = box
    for xx in range(int(x1) + 10, int(x2) - 8, 14):
        draw.line((xx, y1, min(xx + 8, x2), y1), fill=(255, 212, 98, 230), width=2)
        draw.line((xx, y2, min(xx + 8, x2), y2), fill=(255, 212, 98, 230), width=2)
    for yy in range(int(y1) + 10, int(y2) - 8, 14):
        draw.line((x1, yy, x1, min(yy + 8, y2)), fill=(255, 212, 98, 230), width=2)
        draw.line((x2, yy, x2, min(yy + 8, y2)), fill=(255, 212, 98, 230), width=2)
    text(draw, ((x1 + x2) / 2, (y1 + y2) / 2), "занят", YELLOW, 17, True, anchor="mm")


def draw_off(draw, box):
    x1, y1, x2, y2 = box
    rounded(draw, box, 16, fill="#241b2a", outline=(255, 255, 255, 22), width=1)
    for sx in range(int(x1) - 60, int(x2) + 60, 18):
        draw.line((sx, y2, sx + 80, y1), fill=(255, 111, 127, 58), width=10)
    text(draw, ((x1 + x2) / 2, y1 + 34), "выходн.", "#d5a8b2", 15, True, anchor="mm")


def draw_card(draw, box, fill, title, meta, duration):
    rounded(draw, box, 16, fill=fill)
    x1, y1, x2, y2 = box
    text(draw, (x1 + 12, y1 + 10), title, "#1f2c42", 16, True)
    text(draw, (x1 + 12, y1 + 34), meta, "#4a5770", 12)
    text(draw, (x1 + 12, y1 + 52), duration, "#4a5770", 12)


def draw_schedule_variant(draw, origin_x, origin_y, width, title, subtitle, variant):
    rounded(draw, (origin_x, origin_y, origin_x + width, origin_y + 430), 24, fill=PANEL, outline=(255, 255, 255, 18), width=1)
    text(draw, (origin_x + 24, origin_y + 24), title, ACCENT, 28, True)
    text(draw, (origin_x + 24, origin_y + 58), subtitle, "#b8c3eb", 15)

    grid_x = origin_x + 20
    grid_y = origin_y + 96
    date_w = 76
    master_w = 146
    slot_w = 74
    head_h = 42
    row_h = 78
    times = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17"]

    rounded(draw, (grid_x, grid_y, grid_x + width - 40, grid_y + 310), 18, fill=GRID, outline=(255, 255, 255, 12), width=1)
    draw.rectangle((grid_x, grid_y, grid_x + width - 40, grid_y + head_h), fill="#11162f")
    text(draw, (grid_x + 14, grid_y + 12), "ДАТА", MUTED, 13, True)
    text(draw, (grid_x + date_w + 18, grid_y + 12), "МАСТЕР", MUTED, 13, True)

    for i, label in enumerate(times):
        x1 = grid_x + date_w + master_w + i * slot_w
        text(draw, (x1 + 20, grid_y + 12), f"{label}:00", ACCENT, 13, True)

    days = [("9", "Чт", "Алексей"), ("10", "Пт", "Дмитрий"), ("11", "Сб", "Гриша")]
    row_y = grid_y + head_h
    for row_idx, (day, wd, name) in enumerate(days):
        y1 = row_y + row_idx * row_h
        draw.line((grid_x, y1, grid_x + width - 40, y1), fill=LINE_SOFT, width=1)
        if row_idx == 0:
            draw.rectangle((grid_x, y1, grid_x + date_w, y1 + row_h * 3), fill=(255, 255, 255, 3))
            text(draw, (grid_x + 34, y1 + 32), day, "white", 34, True, anchor="mm")
            text(draw, (grid_x + 34, y1 + 62), wd, "#91a2cf", 17, True, anchor="mm")
        draw.ellipse((grid_x + date_w + 12, y1 + 20, grid_x + date_w + 42, y1 + 50), fill=["#76c9ff", "#bbe06f", "#ffc85d"][row_idx])
        text(draw, (grid_x + date_w + 27, y1 + 28), name[0], "#203149", 16, True)
        text(draw, (grid_x + date_w + 54, y1 + 24), name, TEXT, 15, True)
        for i in range(len(times)):
            x1 = grid_x + date_w + master_w + i * slot_w
            rounded(draw, (x1 + 3, y1 + 5, x1 + slot_w - 3, y1 + row_h - 5), 12, fill=GRID, outline=(129, 147, 210, 26), width=1)
            text(draw, (x1 + slot_w / 2, y1 + row_h / 2 - 4), "+", (160, 174, 220, 52), 20, False, anchor="mm")

    # variant overlays
    base_y = row_y
    start_x = grid_x + date_w + master_w + 1 * slot_w

    if variant == 1:
        draw_card(
            draw,
            (start_x + 6, base_y + 10, start_x + slot_w * 3 - 8, base_y + row_h - 10),
            GREEN,
            "Чистка",
            "Мария · Текучёва, 21",
            "09:00–12:00 · 3 часа",
        )
        draw_busy(draw, (start_x + slot_w * 5 + 8, base_y + 12, start_x + slot_w * 6 - 8, base_y + row_h - 12))
        draw_off(draw, (start_x + slot_w * 7 + 8, base_y + 12, start_x + slot_w * 8 - 8, base_y + row_h - 12))

    elif variant == 2:
        draw_card(
            draw,
            (start_x + 6, base_y + 10, start_x + slot_w - 8, base_y + row_h - 10),
            GREEN,
            "Чистка",
            "Мария",
            "09:00",
        )
        for idx in (1, 2):
            cont_box = (start_x + slot_w * idx + 6, base_y + 10, start_x + slot_w * (idx + 1) - 8, base_y + row_h - 10)
            rounded(draw, cont_box, 16, fill="#c9e5bb", outline=(255, 255, 255, 40), width=1)
            text(draw, (((cont_box[0] + cont_box[2]) / 2), (cont_box[1] + cont_box[3]) / 2), "→", "#4b5c6f", 28, True, anchor="mm")
        draw_busy(draw, (start_x + slot_w * 5 + 8, base_y + 12, start_x + slot_w * 6 - 8, base_y + row_h - 12))
        draw_off(draw, (start_x + slot_w * 7 + 8, base_y + 12, start_x + slot_w * 8 - 8, base_y + row_h - 12))

    else:
        draw_card(
            draw,
            (start_x + 6, base_y + 10, start_x + slot_w * 3 - 8, base_y + row_h - 10),
            PINK,
            "Монтаж",
            "Евгения · Центр",
            "09:00–12:00 · 3 часа",
        )
        text(draw, (origin_x + 24, origin_y + 384), "На десктопе один длинный блок, на мобильном — связанные часовые тайлы.", "#9aa8d4", 13)


def draw_mobile_variant(draw, origin_x, origin_y):
    rounded(draw, (origin_x, origin_y, origin_x + 560, origin_y + 330), 24, fill=PANEL, outline=(255, 255, 255, 18), width=1)
    text(draw, (origin_x + 24, origin_y + 22), "Вариант 3 на мобильном", ACCENT, 28, True)
    text(draw, (origin_x + 24, origin_y + 56), "Те же часы, но один заказ разбит на понятные связанные тайлы.", "#b8c3eb", 15)

    timeline_y = origin_y + 106
    text(draw, (origin_x + 24, timeline_y - 30), "Таймлайн дня · 09.04", TEXT, 18, True)
    labels = [("08:00", "свободно", None), ("09:00", "заказ", "#f7dce0"), ("10:00", "прод.", "#f7dce0"), ("11:00", "прод.", "#f7dce0"), ("12:00", "свободно", None), ("13:00", "занят", "busy")]
    x = origin_x + 24
    y = timeline_y
    for idx, (hour, state, mode) in enumerate(labels):
        box = (x, y, x + 78, y + 82)
        if mode == "#f7dce0":
            rounded(draw, box, 16, fill="#f7dce0")
            text(draw, (x + 39, y + 20), hour, "#313f56", 14, True, anchor="mm")
            text(draw, (x + 39, y + 48), state, "#4e5a71", 14, True, anchor="mm")
            if idx in (1, 2):
                draw.line((box[2] - 3, y + 16, box[2] - 3, y + 66), fill="#d7a9b4", width=2)
        elif mode == "busy":
            draw_busy(draw, box)
            text(draw, (x + 39, y + 20), hour, "#313f56", 14, True, anchor="mm")
        else:
            rounded(draw, box, 16, fill=GRID, outline=(255, 255, 255, 18), width=1)
            text(draw, (x + 39, y + 20), hour, TEXT, 14, True, anchor="mm")
            text(draw, (x + 39, y + 48), state, "#91a1cd", 14, anchor="mm")
        x += 88


img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

draw.rectangle((0, 0, W, 260), fill=PANEL2)
draw.rectangle((0, 190, W, H), fill=BG)
text(draw, (70, 54), "Часовые слоты: 3 варианта отображения", ACCENT, 42, True)
text(draw, (70, 112), "Все варианты предполагают шаг 1 час. Оператор может выбрать подряд 1, 2 или 3+ часов, а CRM сохранит это как один заказ с длительностью.", "#b8c3eb", 18)

legend_x = 70
for color, label in ((GREEN, "один длинный заказ"), ("#c9e5bb", "продолжение"), (YELLOW, "занят"), (RED, "выходной")):
    rounded(draw, (legend_x, 156, legend_x + 170, 194), 14, fill=(255, 255, 255, 10), outline=(255, 255, 255, 20), width=1)
    draw.ellipse((legend_x + 12, 168, legend_x + 24, 180), fill=color)
    text(draw, (legend_x + 34, 164), label, TEXT, 14)
    legend_x += 186

draw_schedule_variant(draw, 60, 240, 560, "Вариант 1", "Один общий блок на 2–3 часа", 1)
draw_schedule_variant(draw, 650, 240, 560, "Вариант 2", "Карточка + ячейки-продолжения", 2)
draw_schedule_variant(draw, 1240, 240, 560, "Вариант 3", "Гибрид: десктоп единым блоком", 3)
draw_mobile_variant(draw, 650, 720)

text(draw, (70, 710), "Как я бы рекомендовал:", ACCENT, 28, True)
text(draw, (70, 754), "1. Для админа и колл-центра взять Вариант 3: он самый читаемый.", TEXT, 18)
text(draw, (70, 786), "2. Для мобильного кабинета мастера использовать таймлайн снизу: видно каждый час, но заказ остаётся связанным.", TEXT, 18)
text(draw, (70, 818), "3. В карточке заказа показывать строку: «Выбрано 09:00–12:00 · 3 часа».", TEXT, 18)

out = "/Users/swift/Desktop/CRM v2/mockups/hourly-schedule-variants.png"
img.save(out, quality=95)
print(out)
