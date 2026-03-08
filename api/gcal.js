import { google } from "googleapis";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

function getAuth() {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return auth;
}

export default async function handler(req, res) {
  const action = req.query.action;

  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    // Criar evento
    if (action === "create" && req.method === "POST") {
      const { summary, startDateTime, endDateTime, description, timezone } = req.body;

      const event = {
        summary,
        description: description || "",
        start: { dateTime: startDateTime, timeZone: timezone || "America/Sao_Paulo" },
        end: { dateTime: endDateTime, timeZone: timezone || "America/Sao_Paulo" }
      };

      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event
      });

      return res.status(200).json({ success: true, event: result.data });
    }

    // Listar eventos do dia
    if (action === "list" && req.method === "GET") {
      const date = req.query.date || new Date().toISOString().split("T")[0];
      const timeMin = new Date(date + "T00:00:00-03:00").toISOString();
      const timeMax = new Date(date + "T23:59:59-03:00").toISOString();

      const result = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime"
      });

      return res.status(200).json({ events: result.data.items || [] });
    }

    res.status(400).json({ error: "Acao invalida" });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
