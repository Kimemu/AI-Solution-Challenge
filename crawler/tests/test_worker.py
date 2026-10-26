import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

location = Path(__file__).resolve().parents[1] / "worker.py"
spec = importlib.util.spec_from_file_location("orbital_crawler", location)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ArticleExtractionTests(unittest.TestCase):
    def test_structured_body_is_preserved_without_menu_and_comments(self):
        body = "\n\n".join(f"{number}번째 실증에서는 공개 위성 자료와 태양광 발전 정보를 결합해 고객의 운영 계획에 활용하는 방법을 검증했다. 성능과 이용권을 함께 확인했으며 데이터의 수집 조건을 기록했다." for number in range(80))
        document = f'<html><head><title>위성 관측 실증</title><script type="application/ld+json">{json.dumps({"@type": "NewsArticle", "articleBody": body}, ensure_ascii=False)}</script></head><body><nav>광고와 메뉴</nav><article><p>{body}</p></article><footer>사업자 정보와 광고</footer></body></html>'
        result = worker.extract_page(document, "https://example.com/news/story")
        self.assertEqual(result["fullText"], body)
        self.assertGreater(len(result["fullText"]), 6000)
        self.assertNotIn("광고와 메뉴", result["fullText"])
        self.assertEqual(result["extractionMethod"], "python-trafilatura")

    def test_paywall_and_short_preview_are_excluded(self):
        restricted = '<script type="application/ld+json">' + json.dumps({"@type": "NewsArticle", "isAccessibleForFree": False, "articleBody": "유료 본문" * 200}) + '</script>'
        with self.assertRaises(worker.CrawlError) as caught:
            worker.extract_page(restricted, "https://example.com/paid")
        self.assertEqual(caught.exception.code, "restricted-article")
        with self.assertRaises(worker.CrawlError):
            worker.extract_page("<article><p>짧은 제목과 안내문입니다.</p></article>", "https://example.com/preview")

    def test_redirect_cannot_fetch_local_or_private_addresses(self):
        def addresses(host, port, *_):
            return [(2, 1, 6, "", ("127.0.0.1" if host == "127.0.0.1" else "93.184.216.34", port))]
        response = unittest.mock.Mock(status=302, headers={"location": "http://127.0.0.1/private"})
        connection = unittest.mock.Mock()
        connection.request.return_value = response
        with patch.object(worker.socket, "getaddrinfo", side_effect=addresses), patch.object(worker.urllib3, "HTTPConnectionPool", return_value=connection):
            with self.assertRaises(worker.CrawlError) as caught:
                worker.download("http://example.com/news")
        self.assertEqual(caught.exception.code, "private-address")
        connection.request.assert_called_once()


if __name__ == "__main__":
    unittest.main()
