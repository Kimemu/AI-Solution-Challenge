"""Google News 주소 해석 → 공개 원문 다운로드 → Trafilatura 본문 추출.

입력은 stdin JSON, 출력은 기사별 JSONL입니다. DB·AI·웹 서버는 Node가 담당합니다.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import logging
import re
import socket
import sys
import threading
from urllib.parse import urljoin, urlsplit, urlunsplit

try:
    import certifi
    import trafilatura
    import urllib3
    from googlenewsdecoder import gnews_decoder_async
    from lxml import html as lxml_html
except ImportError as exc:
    print(json.dumps({"fatal": True, "code": "setup-required", "error": "Python 수집기 설치가 필요합니다. setup-crawler.cmd를 실행해 주세요."}), flush=True)
    raise SystemExit(2) from exc

logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
MAX_HTML = 5_000_000
MAX_TEXT = 100_000
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
output_lock = threading.Lock()


class CrawlError(Exception):
    def __init__(self, message: str, code: str = "extraction-failed"):
        super().__init__(message)
        self.code = code


def public_target(address: str) -> tuple:
    parsed = urlsplit(address)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise CrawlError("공개 HTTP/HTTPS 기사 주소만 수집할 수 있습니다.", "invalid-url")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise CrawlError("올바르지 않은 포트입니다.", "invalid-url") from exc
    if port not in (80, 443):
        raise CrawlError("기사 수집은 80/443 포트만 허용합니다.", "invalid-url")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, socket.AF_INET, socket.SOCK_STREAM)
    except OSError as exc:
        raise CrawlError("원문 서버의 주소를 찾지 못했습니다.", "dns-failed") from exc
    ips = {item[4][0] for item in addresses}
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise CrawlError("내부망·로컬 주소는 수집할 수 없습니다.", "private-address")
    return parsed, sorted(ips)[0], port


def download(address: str, hops: int = 0) -> tuple[bytes, str]:
    if hops > 4:
        raise CrawlError("원문 리디렉션 횟수가 너무 많습니다.", "redirect-limit")
    parsed, ip, port = public_target(address)
    headers = {"Host": parsed.netloc, "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ko,en;q=0.9", "Accept-Encoding": "gzip, deflate"}
    timeout = urllib3.Timeout(connect=7, read=13)
    if parsed.scheme == "https":
        connection = urllib3.HTTPSConnectionPool(ip, port=port, timeout=timeout, maxsize=1, cert_reqs="CERT_REQUIRED", ca_certs=certifi.where(), assert_hostname=parsed.hostname, server_hostname=parsed.hostname)
    else:
        connection = urllib3.HTTPConnectionPool(ip, port=port, timeout=timeout, maxsize=1)
    response = None
    try:
        target = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
        response = connection.request("GET", target, headers=headers, redirect=False, retries=False, preload_content=False)
        if 300 <= response.status < 400 and response.headers.get("location"):
            next_url = urljoin(address, response.headers["location"])
            # 리디렉션마다 공개 주소를 다시 검증하고, 검증한 IP로만 연결합니다.
            return download(next_url, hops + 1)
        if response.status in (401, 402, 403, 429):
            raise CrawlError(f"원문 접근 제한 ({parsed.hostname}, HTTP {response.status})", "access-blocked")
        if response.status != 200:
            raise CrawlError(f"원문 서버 오류 ({parsed.hostname}, HTTP {response.status})", "http-error")
        content_type = response.headers.get("content-type", "").lower()
        if content_type and "html" not in content_type:
            raise CrawlError("HTML 기사 페이지가 아닙니다.", "not-article")
        chunks, length = [], 0
        for chunk in response.stream(65536, decode_content=True):
            length += len(chunk)
            if length > MAX_HTML:
                raise CrawlError("원문 HTML이 5MB를 초과합니다.", "too-large")
            chunks.append(chunk)
        return b"".join(chunks), address
    except CrawlError:
        raise
    except Exception as exc:
        raise CrawlError(f"원문 연결·보안 인증·응답 시간 오류 ({parsed.hostname})", "network-error") from exc
    finally:
        if response is not None:
            response.release_conn()
        connection.close()


def article_json_nodes(value):
    if isinstance(value, dict):
        types = value.get("@type", [])
        types = [types] if isinstance(types, str) else types
        if any("Article" in str(kind) for kind in types) or "articleBody" in value:
            yield value
        for item in value.values():
            yield from article_json_nodes(item)
    elif isinstance(value, list):
        for item in value:
            yield from article_json_nodes(item)


def extract_page(content: bytes | str, address: str) -> dict:
    try:
        tree = lxml_html.fromstring(content)
    except Exception as exc:
        raise CrawlError("원문 HTML을 해석하지 못했습니다.") from exc
    structured = []
    for element in tree.xpath('//script[@type="application/ld+json"]'):
        try:
            structured.extend(article_json_nodes(json.loads(element.text or "{}")))
        except (ValueError, TypeError):
            continue
    if any(node.get("isAccessibleForFree") in (False, "False", "false") for node in structured):
        raise CrawlError("로그인·유료 구독이 필요한 기사입니다.", "restricted-article")
    data = trafilatura.extract(content, url=address, output_format="json", with_metadata=True, include_comments=False, include_tables=True, deduplicate=True)
    metadata = json.loads(data) if data else {}
    text = (metadata.get("text") or "").strip()
    # 본문을 직접 제공하는 JSON-LD가 더 완전하면 해당 본문을 사용합니다.
    for node in structured:
        body = node.get("articleBody")
        if isinstance(body, str) and len(body.strip()) > len(text):
            text = re.sub(r"<[^>]+>", " ", body).strip()
    text = re.sub(r"[ \t]+", " ", text).replace("\x00", "")
    if re.search(r"access denied|verify you are human|checking your browser|enable javascript and cookies|subscribe to continue|sign in to continue|로봇이 아님|접근이 차단", text[:600], re.I):
        raise CrawlError("기사 대신 접근 차단·인증 페이지가 반환됐습니다.", "access-blocked")
    if len(text) < 300:
        raise CrawlError("공개된 기사 본문이 300자 미만입니다. 로그인·JavaScript 페이지일 수 있습니다.", "body-too-short")
    if len(text) > MAX_TEXT:
        raise CrawlError("원문이 100,000자를 초과해 본문을 잘라서 요약하지 않았습니다.", "body-too-large")
    return {"fullText": text, "resolvedUrl": address, "articleTitle": metadata.get("title"), "author": metadata.get("author"), "publishedAt": metadata.get("date"), "extractionMethod": "python-trafilatura", "pipelineVersion": 1, "contentHash": hashlib.sha256(text.encode("utf-8")).hexdigest(), "fetchedAt": datetime.now(timezone.utc).isoformat()}


def fetch_article(article: dict, address: str) -> dict:
    content, resolved = download(address)
    try:
        return extract_page(content, resolved)
    except CrawlError as exc:
        if exc.code != "body-too-short":
            raise
        # 공개 페이지가 명시적으로 제공하는 AMP 링크만 대체 입력으로 허용합니다.
        tree = lxml_html.fromstring(content)
        links = tree.xpath('//link[contains(concat(" ", normalize-space(@rel), " "), " amphtml ")]/@href')
        if links:
            amp = urljoin(resolved, links[0])
            original_host = urlsplit(resolved).hostname.removeprefix("www.")
            amp_host = urlsplit(amp).hostname or ""
            if amp_host.removeprefix("www.") == original_host:
                content, resolved = download(amp)
                result = extract_page(content, resolved)
                result["extractionMethod"] = "python-trafilatura-public-amp"
                return result
        raise


def emit(value: dict):
    with output_lock:
        print(json.dumps(value, ensure_ascii=False), flush=True)


def run(articles: list[dict]):
    if len(articles) > 500:
        raise ValueError("한 번에 500개 기사까지 수집할 수 있습니다.")
    for offset in range(0, len(articles), 10):
        batch = articles[offset:offset + 10]
        decoded = {}
        google = [article for article in batch if urlsplit(article.get("url", "")).hostname == "news.google.com"]
        if google:
            try:
                results = asyncio.run(gnews_decoder_async([article["url"] for article in google], timeout=9.0, concurrency=3))
                for article, result in zip(google, results):
                    decoded[article["id"]] = result
            except Exception:
                decoded = {article["id"]: {"success": False, "message": "Google News 주소 해석 서버에 연결하지 못했습니다."} for article in google}
        targets = []
        for article in batch:
            address = article.get("url", "")
            if article in google:
                result = decoded.get(article["id"], {})
                if not result.get("success"):
                    emit({"id": article["id"], "ok": False, "code": "google-decode-failed", "error": "Google News 원문 주소 해석 실패: " + str(result.get("message", "응답 없음"))[:200]})
                    continue
                address = result["decoded_url"]
            targets.append((article, address))
        with ThreadPoolExecutor(max_workers=3) as executor:
            tasks = {executor.submit(fetch_article, article, address): article for article, address in targets}
            for task in as_completed(tasks):
                article = tasks[task]
                try:
                    emit({"id": article["id"], "ok": True, **task.result()})
                except Exception as exc:
                    emit({"id": article["id"], "ok": False, "code": getattr(exc, "code", "extraction-failed"), "error": str(exc)[:400]})


def main():
    if "--health" in sys.argv:
        emit({"ok": True, "python": sys.version.split()[0], "extractor": "trafilatura", "version": trafilatura.__version__})
        return
    payload = json.load(sys.stdin)
    if payload.get("operation") == "extract":
        emit({"ok": True, **extract_page(payload.get("html", ""), payload.get("url", "https://example.com/article"))})
    else:
        run(payload.get("articles", []))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"fatal": True, "error": str(exc)[:400], "code": getattr(exc, "code", "worker-failed")})
        raise SystemExit(1)
