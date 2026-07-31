import argparse
import functools
import http.server
import json
from pathlib import Path
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description="Serve the real Keep shell with a deterministic test snapshot.")
    parser.add_argument("--static-dir", required=True)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--port", type=int, default=8961)
    args = parser.parse_args()

    static_dir = Path(args.static_dir).resolve()
    snapshot = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    injection = (
        "<script>localStorage.setItem('sieglingsKeepTutorialSeen','1');"
        f"window.__KEEP_TEST_SNAPSHOT__={json.dumps(snapshot, separators=(',', ':'))};</script>"
    )

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if urlparse(self.path).path in {"/keep", "/keep.html"}:
                content = (static_dir / "keep.html").read_text(encoding="utf-8")
                content = content.replace('<script src="/js/config.js?v=1"></script>', injection + '<script src="/js/config.js?v=1"></script>')
                payload = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            super().do_GET()

        def log_message(self, _format, *_args):
            return

    handler = functools.partial(Handler, directory=str(static_dir))
    http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
