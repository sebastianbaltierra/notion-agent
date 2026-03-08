import json
import urllib.request
import urllib.error
import os

def handler(request):
    notion_key = os.environ.get("NOTION_API_KEY", "")
    headers = {
        "Authorization": f"Bearer {notion_key}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }

    def notion_req(method, endpoint, data=None):
        url = f"https://api.notion.com/v1{endpoint}"
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read()), 200
        except urllib.error.HTTPError as e:
            return json.loads(e.read()), e.code

    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    }

    if request.method == "OPTIONS":
        return Response("", 200, cors)

    path = request.path

    if request.method == "GET" and path == "/api/notion/databases":
        result, status = notion_req("POST", "/search", {
            "filter": {"value": "database", "property": "object"}
        })
        databases = []
        for item in result.get("results", []):
            t = item.get("title", [])
            title = t[0]["plain_text"] if t else "Sem título"
            databases.append({"id": item["id"], "title": title})
        return Response(json.dumps({"databases": databases}), status, cors)

    if request.method == "POST":
        body = json.loads(request.body or "{}")
        if path == "/api/notion/create-task":
            db_id = body.get("database_id")
            props = body.get("properties", {})
            result, status = notion_req("POST", "/pages", {
                "parent": {"database_id": db_id},
                "properties": props
            })
            return Response(json.dumps(result), status, cors)

        if path == "/api/notion/database-properties":
            db_id = body.get("database_id")
            result, status = notion_req("GET", f"/databases/{db_id}")
            props = result.get("properties", {}) if status == 200 else {}
            return Response(json.dumps({"properties": props}), status, cors)

    return Response(json.dumps({"error": "Not found"}), 404, cors)
