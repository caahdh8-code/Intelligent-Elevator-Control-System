require("dotenv").config();

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 10000;

/* =====================================
   BASIC CONFIGURATION
===================================== */

const allowedOrigins = (process.env.WEBSITE_URL || "")
  .split(",")
  .map(origin => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed"));
  }
}));

app.use(express.json({ limit: "10mb" }));

/* =====================================
   GROQ CONFIGURATION
===================================== */

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

/* =====================================
   HOTEL EMAIL CONFIGURATION
===================================== */

const HOTEL_EMAIL =
  process.env.HOTEL_EMAIL || "caahdh8@gmail.com";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

let transporter = null;

if (EMAIL_USER && EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_APP_PASSWORD
    }
  });
}

/* =====================================
   HOTEL FACILITY MAP
===================================== */

const FACILITY_MAP = process.env.FACILITY_MAP || `
Floor 1:
- Hotel Lobby
- Reception Counter
- Main Entrance
- Restaurant
- Guest Service Counter

Floor 2:
- Standard Guest Rooms
- Meeting Room
- Lounge

Floor 3:
- Premium Guest Rooms
- Hotel Facilities
- Recreation Area
`;

/* =====================================
   GENERAL FUNCTIONS
===================================== */

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validFloor(floor) {
  return [1, 2, 3].includes(Number(floor));
}

function validImage(image) {
  if (typeof image !== "string") return false;

  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image);
}

/* =====================================
   GROQ API FUNCTION
===================================== */

async function callGroq(messages, model) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 1200,
      response_format: {
        type: "json_object"
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Groq API error:", result);

    throw new Error(
      result.error?.message || "Groq API request failed"
    );
  }

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty AI response");
  }

  return JSON.parse(content);
}

/* =====================================
   SYSTEM PROMPT
===================================== */

function buildSystemPrompt() {
  return `
You are the AI Hotel Assistant for a three-floor hotel.

You can communicate in Malay or English.
Always reply using the language used by the guest.

HOTEL FACILITIES:
${FACILITY_MAP}

GENERAL RULES:

1. Be polite, helpful and concise.
2. Answer questions about hotel facilities using the facility map.
3. Never invent facilities or locations.
4. Never assume the guest's current floor.
5. Do not control the PLC directly.
6. Never submit an elevator request without confirmation.
7. Never claim that a report has been sent unless the server confirms it.

RESPONSE FORMAT:

Always return valid JSON.

Normal response:
{
  "reply": "Your response",
  "action": "none",
  "currentFloor": null,
  "destinationFloor": null,
  "report": null
}

ELEVATOR REQUEST:

1. If the guest wants to use the elevator, ask their current floor
   if it is not known.
2. Ask their destination.
3. Map the requested facility to the correct floor using the facility map.
4. If the destination floor equals the current floor, explain that
   they are already on that floor.
5. Before submitting, ask the guest for explicit confirmation.
6. Remember the pending current floor and destination from conversation history.
7. If the guest confirms, return:

{
  "reply": "Your elevator request is being submitted.",
  "action": "submit",
  "currentFloor": 1,
  "destinationFloor": 2,
  "report": null
}

8. If the guest has not confirmed, action must remain "none".
9. Do not guess the current floor.

HOTEL REPORTS:

Supported report types:
- Lost Item
- Suspicious Person
- Facility Damage
- General Complaint
- Other

For every report, collect ONLY these three required details:

1. Report type.
2. Incident floor (Floor 1, Floor 2 or Floor 3).
3. Exact incident location.

Ask for missing details naturally, one at a time if necessary.

Do not require the guest's name, room number, phone number or email address.

Do not assume the incident floor is the guest's current floor.

Once all three details are available, summarize the report and ask
the guest for confirmation.

Only when the guest explicitly confirms, return:

{
  "reply": "Your anonymous report is being submitted.",
  "action": "report",
  "currentFloor": null,
  "destinationFloor": null,
  "report": {
    "type": "Lost Item",
    "incidentFloor": 2,
    "location": "Near the lounge"
  }
}

The report description may be a short summary of the guest's
messages. Do not invent details.

LOST ITEM SPECIAL RULE:

1. If the guest finds an item, first recommend handing it to the
   hotel service counter.
2. If the guest does not want to go to the counter, do not force them.
3. Ask the guest for the exact location where the item is left.
4. Recommend leaving it in a safe place that does not block walkways
   or create danger.
5. Tell the guest that hotel staff can be notified to collect it.
6. Do not claim staff have collected the item.
7. Treat a found item as a Lost Item report.

SUSPICIOUS PERSON:

1. Record only the guest's observations and location.
2. Never identify a person or accuse someone based on appearance.
3. If the guest is in immediate danger, advise them to move to a
   safe place and contact hotel security or emergency services.
4. Do not delay urgent safety action while collecting a report.

IMAGE:

If an image is provided, describe only what is visibly present.
Do not identify people.
Do not claim that an image proves criminal behaviour.
Use the image as supporting context only.

IMPORTANT:
The AI must not invent an incident floor, report type or location.
The report action must only be returned after explicit confirmation.
`;
}

/* =====================================
   HEALTH CHECK
===================================== */

app.get("/", (req, res) => {
  res.send("Intelligent Elevator AI Backend is running.");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    aiConfigured: Boolean(GROQ_API_KEY),
    emailConfigured: Boolean(
      transporter && HOTEL_EMAIL
    )
  });
});

/* =====================================
   AI ASSISTANT ENDPOINT
===================================== */

app.post("/api/assistant", async (req, res) => {
  try {
    const {
      message,
      currentFloor,
      history = [],
      image
    } = req.body;

    if (
      (!message || typeof message !== "string") &&
      !image
    ) {
      return res.status(400).json({
        error: "Message or image is required."
      });
    }

    if (
      currentFloor !== null &&
      currentFloor !== undefined &&
      !validFloor(currentFloor)
    ) {
      return res.status(400).json({
        error: "Invalid current floor."
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        error: "Invalid conversation history."
      });
    }

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-12)
      .map(item => ({
        role: item.role,
        content: item.content.slice(0, 3000)
      }));

    const messages = [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      ...safeHistory
    ];

    if (image) {
      if (!validImage(image)) {
        return res.status(400).json({
          error: "Unsupported image format."
        });
      }

      if (image.length > 7 * 1024 * 1024) {
        return res.status(413).json({
          error: "Image is too large."
        });
      }

      const visionMessage = {
        role: "user",
        content: [
          {
            type: "text",
            text: message || "Please describe this image."
          },
          {
            type: "image_url",
            image_url: {
              url: image
            }
          }
        ]
      };

      messages.push(visionMessage);

      const result = await callGroq(
        messages,
        GROQ_VISION_MODEL
      );

      return res.json(result);
    }

    messages.push({
      role: "user",
      content:
        `Current floor supplied by guest: ${
          currentFloor || "NOT PROVIDED"
        }.\nGuest message: ${message}`
    });

    const result = await callGroq(
      messages,
      GROQ_MODEL
    );

    /* Validate AI elevator action */

    if (result.action === "submit") {
      if (
        !validFloor(result.currentFloor) ||
        !validFloor(result.destinationFloor) ||
        Number(result.currentFloor) === Number(result.destinationFloor)
      ) {
        return res.json({
          reply: "I could not validate your elevator request. Please try again.",
          action: "none",
          currentFloor: null,
          destinationFloor: null,
          report: null
        });
      }
    }

    /* Validate AI report action */

    if (result.action === "report") {
      const report = result.report || {};

      const allowedTypes = [
        "Lost Item",
        "Suspicious Person",
        "Facility Damage",
        "General Complaint",
        "Other"
      ];

      if (
        !allowedTypes.includes(report.type) ||
        !validFloor(report.incidentFloor) ||
        typeof report.location !== "string" ||
        !report.location.trim()
      ) {
        return res.json({
          reply: "The report details are incomplete. Please provide the report type, incident floor and location.",
          action: "none",
          currentFloor: null,
          destinationFloor: null,
          report: null
        });
      }

      report.location = report.location.trim().slice(0, 300);
      report.description = "";
    }

    res.json(result);

  } catch (error) {
    console.error("Assistant endpoint error:", error);

    res.status(502).json({
      error: "AI assistant is temporarily unavailable."
    });
  }
});

/* =====================================
   ANONYMOUS HOTEL REPORT ENDPOINT
===================================== */

app.post("/api/report", async (req, res) => {
  try {
    if (!transporter || !HOTEL_EMAIL) {
      return res.status(503).json({
        success: false,
        error: "Hotel email service is not configured."
      });
    }

    const {
      reportType,
      incidentFloor,
      location,
      description = "",
      image
    } = req.body;

    const allowedTypes = [
      "Lost Item",
      "Suspicious Person",
      "Facility Damage",
      "General Complaint",
      "Other"
    ];

    if (!allowedTypes.includes(reportType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid report type."
      });
    }

    if (!validFloor(incidentFloor)) {
      return res.status(400).json({
        success: false,
        error: "Invalid incident floor."
      });
    }

    if (
      typeof location !== "string" ||
      !location.trim() ||
      location.length > 300
    ) {
      return res.status(400).json({
        success: false,
        error: "Valid incident location is required."
      });
    }

    if (
      typeof description !== "string" ||
      description.length > 3000
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid report description."
      });
    }

    const reportId =
      "HOTEL-" + Date.now();

    const date = new Date();

    const malaysiaDate = date.toLocaleDateString(
      "en-MY",
      { timeZone: "Asia/Kuala_Lumpur" }
    );

    const malaysiaTime = date.toLocaleTimeString(
      "en-MY",
      {
        timeZone: "Asia/Kuala_Lumpur",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }
    );

    let imageHtml = "";
    const attachments = [];

    if (image) {
      if (!validImage(image)) {
        return res.status(400).json({
          success: false,
          error: "Invalid image format."
        });
      }

      if (image.length > 7 * 1024 * 1024) {
        return res.status(413).json({
          success: false,
          error: "Image is too large."
        });
      }

      const match = image.match(
        /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i
      );

      if (match) {
        const extension = match[1].toLowerCase() === "jpeg"
          ? "jpg"
          : match[1].toLowerCase();

        attachments.push({
          filename: `evidence-${reportId}.${extension}`,
          content: Buffer.from(match[2], "base64"),
          contentType: `image/${match[1].toLowerCase()}`
        });

        imageHtml = "<p>Image evidence is attached to this email.</p>";
      }
    }

    const emailHTML = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Anonymous Hotel Report</h2>

        <p><b>Report ID:</b> ${escapeHTML(reportId)}</p>

        <hr>

        <p><b>Report Type:</b> ${escapeHTML(reportType)}</p>

        <p><b>Incident Floor:</b> Floor ${Number(incidentFloor)}</p>

        <p><b>Location:</b> ${escapeHTML(location)}</p>

        <p><b>Description:</b><br>
        ${escapeHTML(description || "Not provided").replace(/\n/g, "<br>")}</p>

        <p><b>Date:</b> ${escapeHTML(malaysiaDate)}</p>

        <p><b>Time:</b> ${escapeHTML(malaysiaTime)}</p>

        <p><b>Reporter:</b> Anonymous</p>

        ${imageHtml}

        <hr>

        <p>Status: Pending Staff Action</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Hotel Anonymous Reporting" <${EMAIL_USER}>`,
      to: HOTEL_EMAIL,
      subject: `Anonymous Hotel Report - ${reportType} - ${reportId}`,
      html: emailHTML,
      attachments
    });

    console.log("Anonymous report email sent:", reportId);

    res.json({
      success: true,
      reportId: reportId,
      message: "Anonymous report submitted successfully."
    });

  } catch (error) {
    console.error("Hotel report error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to submit report."
    });
  }
});

/* =====================================
   SERVER START
===================================== */

app.listen(PORT, () => {
  console.log(
    `Intelligent Elevator AI server running on port ${PORT}`
  );
});
