"""Record published artifacts only; never call business APIs or execute scripts."""

import datetime
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request


ORIGIN = "https://data.spacehunters.com.br"
LIMIT_BYTES = 4 * 1024 * 1024
entries = []
provenance = []
target = Path(os.environ["RUNNER_TEMP"]) / "atlas-rea-public"
target.mkdir()


def record(url, filename):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    tick = time.monotonic()
    request = urllib.request.Request(url, headers={"User-Agent": "AtlasResearch/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if urllib.parse.urlsplit(response.url).netloc != "data.spacehunters.com.br":
            raise ValueError("redirect outside selected public origin")
        body = response.read(LIMIT_BYTES + 1)
        if len(body) > LIMIT_BYTES:
            raise ValueError("published artifact exceeds bounded capture")
        mime = response.headers.get_content_type()
        status = response.status
        status_text = response.reason
        headers = [{"name": k, "value": v} for k, v in response.headers.items()
                   if k.lower() != "set-cookie"]
    (target / filename).write_bytes(body)
    provenance.append({"url": url, "path": filename, "bytes": len(body),
                       "sha256": hashlib.sha256(body).hexdigest(), "status": status})
    entries.append({
        "startedDateTime": started, "time": round((time.monotonic() - tick) * 1000, 3),
        "request": {"method": "GET", "url": url, "httpVersion": "unknown",
                    "headers": [{"name": "User-Agent", "value": "AtlasResearch/1.0"}],
                    "queryString": [], "cookies": [], "headersSize": -1, "bodySize": 0},
        "response": {"status": status, "statusText": status_text, "httpVersion": "unknown",
                     "headers": headers, "cookies": [], "redirectURL": "",
                     "headersSize": -1, "bodySize": len(body),
                     "content": {"size": len(body), "mimeType": mime,
                                 "comment": "Body intentionally omitted; artifact SHA-256 in provenance"}},
        "cache": {}, "timings": {"send": -1, "wait": -1, "receive": -1},
        "comment": "Python urllib HTTP observation; not a browser or authenticated application capture"})
    return body


class Modules(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "script" and data.get("type") == "module" and data.get("src"):
            self.sources.append(data["src"])


html = record(ORIGIN + "/", "index.html")
parser = Modules()
parser.feed(html.decode("utf8"))
if len(parser.sources) != 1:
    raise ValueError("expected exactly one public module; review selection before expanding scope")
bundle_url = urllib.parse.urljoin(ORIGIN + "/", parser.sources[0])
parts = urllib.parse.urlsplit(bundle_url)
if parts.scheme != "https" or parts.netloc != "data.spacehunters.com.br" or not parts.path.startswith("/assets/"):
    raise ValueError("module outside selected published asset scope")
record(bundle_url, "app.js")
Path("evidence/provenance.json").write_text(json.dumps(provenance, indent=2))
Path(os.environ["RUNNER_TEMP"], "atlas-rea-public.har").write_text(json.dumps({
    "log": {"version": "1.2", "creator": {"name": "Atlas urllib recorder", "version": "1"},
            "entries": entries}}))
print(json.dumps(provenance, indent=2))
