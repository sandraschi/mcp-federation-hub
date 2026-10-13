import asyncio
import time

t0 = time.time()
import app.main
from app.health_monitor import _health_check

fm = app.main.federation_manager
hp = app.main._health_probe_urls
print(f"Import: {time.time() - t0:.1f}s")

t0 = time.time()
r = asyncio.run(_health_check(10857, "127.0.0.1"))
print(f"Bridge 10857: {time.time() - t0:.2f}s -> {'ALIVE' if r else 'DEAD'}")

t0 = time.time()
r = asyncio.run(_health_check(9999, "127.0.0.1"))
print(f"Closed 9999: {time.time() - t0:.2f}s -> {'ALIVE' if r else 'DEAD'}")

for sid in ["docker-mcp", "calibre-mcp", "plex-mcp"]:
    cfg = fm.get_server_config(sid)
    if cfg:
        urls = hp(cfg)
        print(f"{sid}: {urls[0] if urls else 'NO URL'}")
print("all ok")
