const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURATION
// ===============================

const WEBSITE_URL =
  process.env.WEBSITE_URL ||
  "https://caahdh8-code.github.io";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

const HOTEL_EMAIL =
  process.env.HOTEL_EMAIL ||
  "caahdh8@gmail.com";

const FACILITY_MAP = {
  1: [
    "Hotel Lobby",
    "Reception Counter",
    "Main Entrance",
    "Restaurant",
    "Guest Service Counter"
  ],
  2: [
    "Standard Guest Rooms",
    "Meeting Room",
    "Lounge"
  ],
  3: [
    "Premium Guest Rooms",
    "Hotel Facilities",
    "Recreation Area",
    "Cinema"
  ]
};

const REPORT_TYPES = [
  "Lost Item",
  "Suspicious Person",
  "Facility Damage",
  "General Complaint",
  "Other"
];

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === WEBSITE_URL) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "10mb" }));

// ===============================
// EMAIL CONFIGURATION
// ===============================

let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

// ===============================
// HELPER FUNCTIONS
// ===============================

function validFloor(floor) {
  return Number.isInteger(Number(floor)) &&
    Number(floor) >= 1 &&
    Number(floor) <= 3;
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function validImage(image) {
  if (!image) return false;

  return typeof image === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image);
}

function generateReportId() {
  return "HOTEL-" +
    Date.now().toString().slice(-8) +
    "-" +
    Math.floor(100 + Math.random() * 900);
}

// ===============================
// GROQ AI FUNCTION
// ===============================

async function callGroq(messages, model) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        response_format: {
          type: "json_object"
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Groq error:", result);
    throw new Error(
      result.error?.message || "AI service request failed"
    );
  }

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty AI response");
  }

  return JSON.parse(content);
}

// ===============================
// AI SYSTEM PROMPT
// ===============================

const SYSTEM_PROMPT = `
You are the AI Hotel Assistant for an Intelligent Elevator System.

You must communicate in the same language as the guest.
Support Malay and English.

HOTEL FLOOR INFORMATION:
${JSON.stringify(FACILITY_MAP, null, 2)}

ELEVATOR RULES:
1. Ask the guest's current floor if it is not provided.
2. Never guess the guest's current floor.
3. Identify the destination floor based on the hotel facility map.
4. If the facility is unclear, ask the guest to clarify.
5. Before requesting the elevator, summarize:
   - Current floor
   - Destination floor
6. Always ask for confirmation before submitting an elevator request.
7. Do not submit if current floor equals destination floor.
8. Never claim the elevator has moved or arrived.
9. The website will handle the actual Firebase elevator request.

REPORTING RULES:
1. Support these report types:
   - Lost Item
   - Suspicious Person
   - Facility Damage
   - General Complaint
   - Other
2. Ask only for:
   - Report type
   - Incident floor
   - Incident location
3. Do not ask for guest name, room number, phone number or email.
4. Do not assume incident floor is the guest's current floor.
5. Summarize the report and ask for confirmation before submission.
6. For lost items, recommend handing the item to the hotel service counter.
7. If the guest does not want to hand it over, ask where the item was left.
8. Recommend a safe location that does not block walkways.
9. For suspicious persons, record observations only.
   Never identify or accuse someone based on appearance.
10. If there is immediate danger, advise the guest to move somewhere safe and contact hotel security.

IMAGE RULES:
If an image is supplied, describe only what can be observed.
Do not invent details.

RESPONSE FORMAT:
Return valid JSON only.

For normal conversation:
{
  "action": "chat",
  "reply": "Your response"
}

For elevator request:
{
  "action": "submit",
  "reply": "Confirmation message",
  "currentFloor": 1,
  "destinationFloor": 2
}

Only use action "submit" after the guest has explicitly confirmed.

For hotel report:
{
  "action": "report",
  "reply": "Report confirmation message",
  "report": {
    "type": "Lost Item",
    "incidentFloor": 1,
    "location": "Hotel Lobby"
  }
}

Only use action "report" after the guest has explicitly confirmed.

Never submit reports or elevator requests without confirmation.
`;

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Intelligent Elevator AI Backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    aiConfigured: Boolean(GROQ_API_KEY),
    emailConfigured: Boolean(transporter)
  });
});

// ===============================
// AI ASSISTANT API
// ===============================

app.post("/api/assistant", async (req, res) => {
  try {
    const { message, currentFloor, history = [], image } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (
      currentFloor !== undefined &&
      currentFloor !== null &&
      !validFloor(currentFloor)
    ) {
      return res.status(400).json({
        error: "Invalid current floor"
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        error: "History must be an array"
      });
    }

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-10);

    const messages = [
      {
        role: "system",
        content:
          SYSTEM_PROMPT +
          `\nGuest current floor: ${
            currentFloor || "Not provided"
          }`
      },
      ...safeHistory
    ];

    if (image) {
      if (!validImage(image)) {
        return res.status(400).json({
          error: "Unsupported image format"
        });
      }

      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: message
          },
          {
            type: "image_url",
            image_url: {
              url: image
            }
          }
        ]
      });
    } else {
      messages.push({
        role: "user",
        content: message
      });
    }

    const model = image
      ? GROQ_VISION_MODEL
      : GROQ_MODEL;

    const data = await callGroq(messages, model);

    if (!data || typeof data.reply !== "string") {
      throw new Error("Invalid AI response format");
    }

    if (data.action === "submit") {
      if (
        !validFloor(data.currentFloor) ||
        !validFloor(data.destinationFloor) ||
        Number(data.currentFloor) === Number(data.destinationFloor)
      ) {
        return res.status(400).json({
          error: "Invalid elevator floor request"
        });
      }

      data.currentFloor = Number(data.currentFloor);
      data.destinationFloor = Number(data.destinationFloor);
    }

    if (data.action === "report") {
      const report = data.report;

      if (
        !report ||
        !REPORT_TYPES.includes(report.type) ||
        !validFloor(report.incidentFloor) ||
        typeof report.location !== "string" ||
        !report.location.trim()
      ) {
        return res.status(400).json({
          error: "Incomplete hotel report"
        });
      }

      data.report = {
        type: report.type,
        incidentFloor: Number(report.incidentFloor),
        location: report.location.trim()
      };
    }

    res.json(data);

  } catch (error) {
    console.error("Assistant error:", error);

    res.status(500).json({
      error: "AI assistant is temporarily unavailable",
      details: error.message
    });
  }
});

// ===============================
// HOTEL REPORT API
// ===============================

app.post("/api/report", async (req, res) => {
  try {
    if (!transporter) {
      return res.status(503).json({
        error: "Hotel email service is not configured"
      });
    }

    const {
      type,
      incidentFloor,
      location,
      description,
      image
    } = req.body;

    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({
        error: "Invalid report type"
      });
    }

    if (!validFloor(incidentFloor)) {
      return res.status(400).json({
        error: "Invalid incident floor"
      });
    }

    if (
      typeof location !== "string" ||
      !location.trim()
    ) {
      return res.status(400).json({
        error: "Incident location is required"
      });
    }

    if (description && typeof description !== "string") {
      return res.status(400).json({
        error: "Invalid description"
      });
    }

    if (image && !validImage(image)) {
      return res.status(400).json({
        error: "Invalid image format"
      });
    }

    const reportId = generateReportId();

    const dateTime = new Intl.DateTimeFormat("en-MY", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: "Asia/Kuala_Lumpur"
    }).format(new Date());

    const safeDescription = escapeHTML(description);
    const safeLocation = escapeHTML(location);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: HOTEL_EMAIL,
      subject: `New Hotel Report - ${reportId}`,
      html: `
        <h2>Hotel Incident Report</h2>
        <p><b>Report ID:</b> ${reportId}</p>
        <p><b>Date & Time:</b> ${escapeHTML(dateTime)}</p>
        <p><b>Report Type:</b> ${escapeHTML(type)}</p>
        <p><b>Incident Floor:</b> Floor ${Number(incidentFloor)}</p>
        <p><b>Location:</b> ${safeLocation}</p>
        <p><b>Description:</b> ${safeDescription || "Not provided"}</p>
        <p><b>Reporter:</b> Anonymous</p>
      `
    };

    if (image) {
      const matches = image.match(
        /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
      );

      if (matches) {
        mailOptions.attachments = [{
          filename: `report-${reportId}.${matches[1]}`,
          content: Buffer.from(matches[2], "base64")
        }];
      }
    }

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      reportId,
      dateTime,
      message: "Hotel report submitted successfully"
    });

  } catch (error) {
    console.error("Report error:", error);

    res.status(500).json({
      error: "Unable to submit hotel report",
      details: error.message
    });
  }
});

// ===============================
// ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(
    `Intelligent Elevator AI Backend running on port ${PORT}`
  );

  console.log(
    `AI configured: ${Boolean(GROQ_API_KEY)}`
  );

  console.log(
    `Email configured: ${Boolean(transporter)}`
  );
});
