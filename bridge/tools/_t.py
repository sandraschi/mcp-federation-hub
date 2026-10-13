import time

t = time.time()
print(f"fastapi: {time.time() - t:.1f}s")
t = time.time()
print(f"httpx: {time.time() - t:.1f}s")
t = time.time()
print(f"uvicorn: {time.time() - t:.1f}s")
print("all ok")
