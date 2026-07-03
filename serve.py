#!/usr/bin/env python3
"""Local preview for v.20 with SPA fallback — mirrors the vercel.json rewrite:
any path that isn't a real file serves /index.html, so /path, /explore/705-745,
/debrief/<id>, /me/... all work exactly like they will on Vercel.

Usage: python3 serve.py [port]   (default 8780)
"""
import http.server
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8780


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def send_head(self):
        # filesystem first (like Vercel), then fall back to the app shell
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.path = "/index.html"
        return super().send_head()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), SPAHandler) as httpd:
        print(f"PrepSignals v.20 preview: http://localhost:{PORT}/ (SPA fallback on)")
        httpd.serve_forever()
