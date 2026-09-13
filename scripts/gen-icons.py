"""One-off placeholder PWA icon generator. Run once during scaffolding; the
physician can swap public/icons/*.png for a real icon later. Writes solid
navy squares with a simple white 'R' glyph block using only the stdlib
(zlib for PNG compression) so no image library dependency is needed.
"""
import struct
import zlib
import os

BG = (15, 23, 42)  # matches --accent
FG = (255, 255, 255)

def make_png(path, size):
    pixels = bytearray()
    margin = size // 5
    bar_w = max(2, size // 10)
    for y in range(size):
        row = bytearray()
        for x in range(size):
            in_r_stem = margin <= x < margin + bar_w and margin <= y < size - margin
            in_r_top = margin <= x < size - margin and margin <= y < margin + bar_w
            in_r_mid = margin <= x < size - margin and (size // 2 - bar_w // 2) <= y < (size // 2 + bar_w // 2)
            in_r_diag = False
            cx0 = size - margin - bar_w
            if size // 2 <= y < size - margin:
                t = (y - size // 2) / max(1, (size - margin - size // 2))
                diag_x = int((size // 2) + t * (size - margin - size // 2))
                if diag_x - bar_w <= x < diag_x:
                    in_r_diag = True
            if in_r_stem or in_r_top or in_r_mid or in_r_diag:
                row += bytes(FG)
            else:
                row += bytes(BG)
        pixels.append(0)  # filter type 0 for the scanline
        pixels += row

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(pixels), 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

    with open(path, 'wb') as f:
        f.write(png)

if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    make_png(os.path.join(out_dir, 'icon-192.png'), 192)
    make_png(os.path.join(out_dir, 'icon-512.png'), 512)
    print('Wrote icon-192.png and icon-512.png')
