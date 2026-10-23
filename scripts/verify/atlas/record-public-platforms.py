"""Bounded official public pages/assets. No authentication or business endpoints."""
import datetime
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(os.environ["RUNNER_TEMP"]) / "atlas-public-platforms"
ROOT.mkdir(exist_ok=True)
OUT = Path("chunk-evidence")
OUT.mkdir(exist_ok=True)
LIMIT = 4 * 1024 * 1024
PLATFORMS = [
    ("spacedata", "https://data.spacehunters.com.br/", "/assets/", 1, "public application entry"),
    ("eyeonfit", "https://www.eyeonfit.com/onde-abrir-academia", "/_next/static/chunks/", 3, "public product page, not authenticated application"),
    ("economapas", "https://app.economapas.com.br/", "/_javascript/printScreen_mapa_socioeconomico.js", 1, "public application entry with selected print helper"),
    ("geofusion", "https://geofusion.com.br/", "/wp-content/themes/", 1, "institutional website, not OnMaps application"),
    ("nology", "https://nology.com.br/economapas/", "/wp-content/", 1, "institutional product page"),
    ("spacehunters", "https://www.spacehunters.com.br/consultoria", "/", 1, "institutional consultancy page, not Space Data application"),
]


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = origin

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parts = urllib.parse.urlsplit(newurl)
        if (parts.scheme, parts.netloc) != self.origin:
            raise ValueError("redirect outside selected public origin")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "script" and data.get("src"):
            self.sources.append(data["src"])


def read_public(url, origin):
    opener = urllib.request.build_opener(SameOriginRedirect(origin))
    req = urllib.request.Request(url, headers={"User-Agent": "AtlasResearch/1.0"})
    with opener.open(req, timeout=30) as response:
        body = response.read(LIMIT + 1)
        if len(body) > LIMIT:
            raise ValueError("public artifact exceeds 4 MiB capture bound")
        return body, {"url": url, "final_url": response.url, "status": response.status,
                      "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                      "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}


manifest = []
for key, page, prefix, budget, surface in PLATFORMS:
    parts = urllib.parse.urlsplit(page)
    origin = (parts.scheme, parts.netloc)
    row = {"platform": key, "surface": surface, "page": page, "assets": [], "errors": [],
           "selection": {"same_origin_path_prefix": prefix, "asset_budget": budget},
           "limits": "Unselected/external scripts and authenticated surfaces remain unknown"}
    try:
        html, page_meta = read_public(page, origin)
        row["page_observation"] = page_meta
        parser = Scripts()
        parser.feed(html.decode("utf8", errors="replace"))
        candidates = []
        for value in parser.sources:
            url = urllib.parse.urljoin(page, value)
            item = urllib.parse.urlsplit(url)
            if (item.scheme, item.netloc) == origin and item.path.startswith(prefix):
                if url not in candidates:
                    candidates.append(url)
        row["eligible_script_count"] = len(candidates)
        for index, url in enumerate(candidates[:budget]):
            try:
                body, meta = read_public(url, origin)
                local = ROOT / f"{key}-{index}.js"
                local.write_bytes(body)
                meta["path"] = str(local)
                row["assets"].append(meta)
            except Exception as exc:
                row["errors"].append({"url": url, "error": str(exc)})
    except Exception as exc:
        row["errors"].append({"url": page, "error": str(exc)})
    manifest.append(row)
    (OUT / "platforms.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"platform": key, "captured_assets": len(row["assets"]), "errors": row["errors"]}))
