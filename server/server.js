const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 10000;

/* =====================================
   1. SERVER CONFIGURATION
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
   2. GROQ AI CONFIGURATION
===================================== */

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

/* =====================================
   3. HOTEL EMAIL CONFIGURATION
===================================== */

const HOTEL_EMAIL =
  process.env.HOTEL_EMAIL || "caahdh8@gmail.com";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const SMTP_HOST =
  process.env.SMTP_HOST || "smtp.gmail.com";

const SMTP_PORT =
  Number(process.env.SMTP_PORT || 465);

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
   4. HOTEL FACILITY MAP
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
   5. HELPER FUNCTIONS
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
  return (
    typeof image === "string" &&
    /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)
  );
}

/* =====================================
   6. GROQ API FUNCTION
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
      model,
      messages,
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
    throw new Error("Empty AI response.");
  }

  return JSON.parse(content);
}

/* =====================================
   7. AI SYSTEM PROMPT
===================================== */

function buildSystemPrompt() {
  return `
You are an AI Hotel Assistant for a three-floor hotel.

LANGUAGE:
- Communicate in Malay or English.
- Follow the language used by the guest.
- Be polite, friendly and helpful.
- Keep answers simple and natural.

HOTEL FACILITIES:

${FACILITY_MAP}

GENERAL RULES:

1. Answer hotel questions using the facility map.
2. Never invent hotel facilities.
3. Never guess the guest's current floor.
4. Never directly control the PLC.
5. Never claim an action is successful before confirmation from the server.

RESPONSE FORMAT:

Always return valid JSON.

Normal response:

{
  "reply": "Your answer",
  "action": "none",
  "currentFloor": null,
  "destinationFloor": null,
  "report": null
}

ELEVATOR REQUEST:

1. Ask for the guest's current floor if unknown.
2. Ask which floor the guest wants to visit.
3. Identify the destination using the facility map.
4. If both floors are the same, explain that the guest is already there.
5. Ask for explicit confirmation before submitting.
6. Remember pending floor details from conversation history.
7. Only after explicit confirmation, return:

{
  "reply": "Your elevator request is being submitted.",
  "action": "submit",
  "currentFloor": 1,
  "destinationFloor": 2,
  "report": null
}

8. Do not submit without confirmation.
9. Do not guess current floor.

HOTEL REPORTS:

Available report types:

- Lost Item
- Suspicious Person
- Facility Damage
- General Complaint
- Other

For each report, collect ONLY:

1. Report type.
2. Incident floor (Floor 1, Floor 2 or Floor 3).
3. Incident location.

Do not require:
- Guest name.
- Room number.
- Phone number.
- Email address.

Do not assume incident floor is the guest's current floor.

Ask for missing information naturally.

After receiving all three details:
- Summarize the report.
- Ask the guest to confirm submission.

Only after explicit confirmation, return:

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

LOST ITEM SPECIAL INSTRUCTIONS:

1. If a guest finds an item, first recommend handing it to the hotel service counter.
2. If the guest does not want to go to the counter, do not force them.
3. Ask for the exact location of the item.
4. Recommend leaving it somewhere safe.
5. Do not leave it in a walkway or dangerous area.
6. Tell the guest that hotel staff can be notified to collect it.
7. Never claim staff have collected it.
8. Treat found items as Lost Item reports.

SUSPICIOUS PERSON:

1. Record only what the guest observes.
2. Never identify or accuse someone based on appearance.
3. If the guest is in immediate danger, advise them to move somewhere safe and contact hotel security or emergency services.
4. Do not delay emergency action to collect a report.

IMAGE:

1. Describe only visible information.
2. Do not identify people.
3. Do not assume criminal activity from an image.
4. Use images only as supporting information.

IMPORTANT:
- Never invent report details.
- Never invent incident floors.
- Never submit reports without explicit confirmation.
- Return JSON only.
`;
}

/* =====================================
   8. SERVER HEALTH CHECK
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
   9. AI ASSISTANT ENDPOINT
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

    /* IMAGE REQUEST */

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

      messages.push({
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
      });

      const result = await callGroq(
        messages,
        GROQ_VISION_MODEL
      );

      return res.json(result);
    }

    /* TEXT REQUEST */

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

    /* VALIDATE ELEVATOR REQUEST */

    if (result.action === "submit") {
      if (
        !validFloor(result.currentFloor) ||
        !validFloor(result.destinationFloor) ||
        Number(result.currentFloor) ===
        Number(result.destinationFloor)
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

    /* VALIDATE HOTEL REPORT */

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
          reply: "The report details are incomplete. Please provide report type, incident floor and location.",
          action: "none",
          currentFloor: null,
          destinationFloor: null,
          report: null
        });
      }

      report.location = report.location.trim().slice(0, 300);
      report.description = "";
    }

    return res.json(result);

  } catch (error) {
    console.error("Assistant endpoint error:", error);

    return res.status(502).json({
      error: "AI assistant is temporarily unavailable."
    });
  }
});

/* =====================================
   10. ANONYMOUS HOTEL REPORT ENDPOINT
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

    const reportId = "HOTEL-" + Date.now();

    const now = new Date();

    const malaysiaDate = now.toLocaleDateString(
      "en-MY",
      { timeZone: "Asia/Kuala_Lumpur" }
    );

    const malaysiaTime = now.toLocaleTimeString(
      "en-MY",
      {
        timeZone: "Asia/Kuala_Lumpur",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }
    );

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
        const extension =
          match[1].toLowerCase() === "jpeg"
            ? "jpg"
            : match[1].toLowerCase();

        attachments.push({
          filename: `evidence-${reportId}.${extension}`,
          content: Buffer.from(match[2], "base64"),
          contentType: `image/${match[1].toLowerCase()}`
        });
      }
    }

    const emailHTML = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">

        <h2>Anonymous Hotel Report</h2>

        <p><b>Report ID:</b>
        ${escapeHTML(reportId)}</p>

        <hr>

        <p><b>Report Type:</b>
        ${escapeHTML(reportType)}</p>

        <p><b>Incident Floor:</b>
        Floor ${Number(incidentFloor)}</p>

        <p><b>Location:</b>
        ${escapeHTML(location)}</p>

        <p><b>Description:</b><br>
        ${escapeHTML(description || "Not provided").replace(/\n/g, "<br>")}
        </p>

        <p><b>Date:</b>
        ${escapeHTML(malaysiaDate)}</p>

        <p><b>Time:</b>
        ${escapeHTML(malaysiaTime)}</p>

        <p><b>Reporter:</b> Anonymous</p>

        <p><b>Evidence:</b>
        ${attachments.length ? "Image attached" : "No image attached"}
        </p>

        <hr>

        <p><b>Status:</b> Pending Staff Action</p>

      </div>
    `;

    await transporter.sendMail({
      from: `"Hotel Anonymous Reporting" <${EMAIL_USER}>`,
      to: HOTEL_EMAIL,
      subject:
        `Anonymous Hotel Report - ${reportType} - ${reportId}`,
      html: emailHTML,
      attachments
    });

    console.log("Report email sent:", reportId);

    return res.json({
      success: true,
      reportId,
      message: "Anonymous report submitted successfully."
    });

  } catch (error) {
    console.error("Hotel report error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to submit report."
    });
  }
});

/* =====================================
   11. ERROR HANDLER
===================================== */

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (err.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Website origin is not allowed."
    });
  }

  return res.status(500).json({
    error: "Internal server error."
  });
});

/* =====================================
   12. START SERVER
===================================== */

app.listen(PORT, () => {
  console.log(
    `Intelligent Elevator AI server running on port ${PORT}`
  );

  console.log(
    `AI Model: ${GROQ_MODEL}`
  );

  console.log(
    `Vision Model: ${GROQ_VISION_MODEL}`
  );

  console.log(
    `Hotel Email: ${HOTEL_EMAIL}`
  );
});
