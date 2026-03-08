const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

async function getAccessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  const action = req.query.action;

  try {
    const token = await getAccessToken();

    if (action === "create" && req.method === "POST") {
      const { summary, startDateTime, endDateTime, description, timezone } = req.body;
      const tz = timezone || "America/Sao_Paulo";

      const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary,
          description: description || "",
          start: { dateTime: startDateTime, timeZone: tz },
          end: { dateTime: endDateTime, timeZone: tz }
        })
      });

      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.status(200).json({ success: true, event: data });
    }

    if (action === "list" && req.method === "GET") {
      const date = req.query.date || new Date().toISOString().split("T")[0];
      const timeMin = encodeURIComponent(date + "T00:00:00-03:00");
      const timeMax = encodeURIComponent(date + "T23:59:59-03:00");

      const r = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=" + timeMin + "&timeMax=" + timeMax + "&singleEvents=true&orderBy=startTime",
        { headers: { "Authorization": "Bearer " + token } }
      );

      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.status(200).json({ events: data.items || [] });
    }

    res.status(400).json({ error: "Acao invalida" });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
