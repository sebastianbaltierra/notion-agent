export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const headers = {
    "Authorization": `Bearer ${NOTION_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  const action = req.query.action;

  if (action === "databases") {
    const r = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ filter: { value: "database", property: "object" } })
    });
    const data = await r.json();
    const databases = (data.results || []).map(db => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Sem título"
    }));
    return res.status(200).json({ databases });
  }

  if (action === "create-task") {
    const { database_id, properties } = req.body;
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({ parent: { database_id }, properties })
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  if (action === "db-properties") {
    const { database_id } = req.body;
    const r = await fetch(`https://api.notion.com/v1/databases/${database_id}`, { headers });
    const data = await r.json();
    return res.status(r.status).json({ properties: data.properties || {} });
  }

  return res.status(404).json({ error: "Not found" });
}
