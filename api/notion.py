from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.error
import os

NOTION_KEY = os.environ.get("NOTION_API_KEY", "")
HEADERS = {
    "Authorization": f"Bearer {NOTION_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}

def notion_request(method, endpoint, data=None):
    url = f"https://api.notion.com/v1{endpoint}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read()), 200
    except urllib.error.HTTPError as e:
        error = json.loads(e.read())
        return {"error": error.get("message", "Erro desconhecido")}, e.code

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/notion/databases":
            result, status = notion_request("POST", "/search", {
                "filter": {"value": "database", "property": "object"}
            })
            databases = []
            if "results" in result:
                for item in result["results"]:
                    title_list = item.get("title", [])
                    title = title_list[0]["plain_text"] if title_list else "Sem título"
                    databases.append({"id": item["id"], "title": title})
            self._respond(200, {"databases": databases})
        else:
            self._respond(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/api/notion/create-task":
            database_id = body.get("database_id")
            properties = body.get("properties", {})
            if not database_id:
                self._respond(400, {"error": "database_id obrigatório"})
                return
            result, status = notion_request("POST", "/pages", {
                "parent": {"database_id": database_id},
                "properties": properties
            })
            self._respond(status, result)

        elif self.path == "/api/notion/database-properties":
            database_id = body.get("database_id")
            if not database_id:
                self._respond(400, {"error": "database_id obrigatório"})
                return
            result, status = notion_request("GET", f"/databases/{database_id}")
            props = result.get("properties", {}) if status == 200 else {}
            self._respond(status, {"properties": props})
        else:
            self._respond(404, {"error": "Not found"})

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def log_message(self, format, *args):
        pass
