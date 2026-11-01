const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 10000;

// ======================================
// CONFIGURATION
// ======================================

const WEBSITE_URL =
  process.env.WEBSITE_URL ||
  "https://caahdh8-code.github.io";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

const HOTEL_EMAIL =
  process.env.HOTEL_EMAIL || "caahdh8@gmail.com";

// ======================================
// HOTEL DIRECTORY
// ======================================

const FACILITIES = {
  1: [
    "Main Entrance",
    "Reception",
    "Front Desk",
    "Waiting Lounge",
    "Restaurant",
    "Cafe",
    "Meeting Room",
    "Hotel Office",
    "Public Toilet"
  ],

  2: [
    "Standard Room",
    "Deluxe Room",
    "Twin Room",
    "Family Room",
    "Housekeeping Room",
    "Laundry Room",
    "Guest Lounge"
  ],

  3: [
    "Swimming Pool",
    "Gymnasium",
    "Spa and Massage",
    "Sauna",
    "Rooftop Restaurant",
    "Sky Lounge",
    "Kids Playroom"
  ]
};

const REPORT_TYPES = [
  "Lost Item",
  "Suspicious Person",
  "Facility Damage",
  "General Complaint",
  "Other"
];

// ======================================
// MIDDLEWARE
// ======================================

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === WEBSITE_URL) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({
  limit: "10mb"
}));

// ======================================
// EMAIL CONFIGURATION
// ======================================

let transporter = null;

if (
  process.env.EMAIL_USER &&
  process.env.EMAIL_APP_PASSWORD
) {
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

// ======================================
// HELPER FUNCTIONS
// ======================================

function validFloor(floor) {
  return (
    Number.isInteger(Number(floor)) &&
    Number(floor) >= 1 &&
    Number(floor) <= 3
  );
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
  return (
    typeof image === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)
  );
}

function generateReportId() {
  return (
    "HOTEL-" +
    Date.now().toString().slice(-8) +
    "-" +
    Math.floor(100 + Math.random() * 900)
  );
}

// ======================================
// JSON RESPONSE PARSER
// ======================================

function parseAIJson(content) {
  if (!content || typeof content !== "string") {
    throw new Error("Empty AI response");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    const error = new Error("AI did not return a valid JSON object");
    error.code = "invalid_json_response";
    throw error;
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const parseError = new Error(
      "AI returned invalid JSON: " + error.message
    );

    parseError.code = "invalid_json_response";
    throw parseError;
  }
}

// ======================================
// GROQ AI FUNCTION
// ======================================

async function callGroq(messages, model) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  async function sendRequest(useJsonMode) {
    const requestBody = {
      model,
      messages,
      temperature: 0.2
    };

    if (useJsonMode) {
      requestBody.response_format = {
        type: "json_object"
      };
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Groq error:", result);

      const error = new Error(
        result.error?.message || "AI service request failed"
      );

      error.code = result.error?.code;
      error.status = response.status;

      throw error;
    }

    const content = result.choices?.[0]?.message?.content;
    return parseAIJson(content);
  }

  try {
    return await sendRequest(true);
  } catch (error) {
    console.error("Groq first attempt failed:", error.message);

    if (
      error.code === "json_validate_failed" ||
      error.code === "invalid_json_response"
    ) {
      console.log("Retrying Groq without JSON mode...");
      return await sendRequest(false);
    }

    throw error;
  }
}

// ======================================
// AI SYSTEM PROMPT
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for an Intelligent Elevator System.

Communicate in the same language as the guest.

Support:
- English
- Bahasa Melayu

Always return one valid JSON object.
Do not use Markdown.
Do not write anything outside the JSON object.

HOTEL FLOOR DIRECTORY:

FLOOR 1:
${FACILITIES[1].join(", ")}

FLOOR 2:
${FACILITIES[2].join(", ")}

FLOOR 3:
${FACILITIES[3].join(", ")}

======================================
LOCATION RULES
======================================

1. Answer facility location questions using this directory.
2. Never invent a facility or its floor.
3. If a facility is not listed, explain that you cannot find it.
4. Cafe is on Floor 1.
5. Guest rooms are on Floor 2.
6. Swimming pool and gymnasium are on Floor 3.

======================================
ELEVATOR RULES
======================================

1. The website provides the guest's current floor.
2. Never guess the current floor.
3. If the guest asks to go to a floor, identify the destination.
4. If the guest asks to go to a facility, identify its floor.
5. Tell the guest the current floor and destination floor.
6. Ask the guest to confirm before submitting.
7. If current floor equals destination floor, reply:
   "You are already here!"
8. Never claim the lift has moved or arrived.
9. The website sends actual requests to Firebase.
10. Never submit an elevator request without confirmation.

When waiting for confirmation, use:

{
  "action": "confirm_lift",
  "reply": "You are currently on Floor 1. Your destination is Floor 3. Would you like me to send the lift? Please confirm.",
  "destinationFloor": 3
}

Do not use action "submit" to bypass the website confirmation process.

======================================
REPORT RULES
======================================

Supported report types:

- Lost Item
- Suspicious Person
- Facility Damage
- General Complaint
- Other

1. Help guests submit a report to the hotel.
2. Ask for the report type.
3. Ask for the incident floor.
4. Ask for the incident location.
5. Ask for a description if necessary.
6. Do not ask for guest name, phone number, email or room number.
7. Do not ask the guest to repeat information already provided.
8. Remember report details from the conversation history.
9. If an image is provided, use visible information only.
10. Do not invent missing report information.

======================================
REPORT CONFIRMATION PROCESS
======================================

This is very important.

The AI must NOT send an email.

The website will send the email only after the guest confirms the report.

Follow this process:

STEP 1:
Collect the report type, incident floor, location and description.

STEP 2:
If important information is missing, ask the guest for the missing information.

STEP 3:
When all required information is available, show a clear summary.

STEP 4:
Ask the guest to confirm the summary before submitting.

STEP 5:
Return action "confirm_report" with the complete report object.

Example:

{
  "action": "confirm_report",
  "reply": "Here is your report summary:\\nReport Type: Lost Item\\nFloor: 1\\nLocation: Main Entrance\\nDescription: A black wallet was lost.\\n\\nIs all the information correct? Please reply YES to submit or NO to cancel.",
  "report": {
    "type": "Lost Item",
    "incidentFloor": 1,
    "location": "Main Entrance",
    "description": "A black wallet was lost."
  }
}

IMPORTANT CONFIRMATION RULES:

1. Do not return "confirm_report" until all required report details are available.
2. Do not return action "report".
3. Do not return action "submit" for reports.
4. Do not claim that an email has been sent.
5. The website handles the guest's YES or NO response.
6. If the guest changes report information before confirmation, update the summary.
7. If the guest says NO before confirmation, respond that the report can be changed or cancelled.
8. Never ask for confirmation repeatedly after the website has already received it.

======================================
SUSPICIOUS PERSON AND SAFETY
======================================

1. Describe visible observations only.
2. Never identify a person in an image.
3. Never accuse anyone based on appearance.
4. If there is immediate danger, advise the guest to move to a safe location and contact hotel security.
5. Do not claim that hotel staff have investigated or resolved an incident.

======================================
IMAGE RULES
======================================

1. If an image is supplied, describe only what is visible.
2. Do not invent details.
3. Do not identify a person in the image.
4. Do not accuse anyone based on appearance.
5. If the image relates to a report, use visible details to help the guest describe the incident.
6. The website may attach the uploaded image to the final hotel report.

======================================
RESPONSE FORMAT
======================================

NORMAL CHAT:

{
  "action": "chat",
  "reply": "Your answer"
}

ELEVATOR CONFIRMATION:

{
  "action": "confirm_lift",
  "reply": "Please confirm your destination.",
  "destinationFloor": 3
}

REPORT SUMMARY AND CONFIRMATION:

{
  "action": "confirm_report",
  "reply": "Here is your report summary. Please confirm before submission.",
  "report": {
    "type": "Lost Item",
    "incidentFloor": 1,
    "location": "Main Entrance",
    "description": "A black wallet was lost."
  }
}

IMPORTANT:

- Always return valid JSON.
- Use the exact action names specified above.
- Never invent missing report information.
- Never claim an email has been sent.
- Never claim a lift has physically moved.
- The website handles final report submission after confirmation.
`;

// ======================================
// HOME PAGE
// ======================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Intelligent Elevator AI Backend is running"
  });
});

// ======================================
// HEALTH CHECK
// ======================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    aiConfigured: Boolean(GROQ_API_KEY),
    emailConfigured: Boolean(transporter)
  });
});

// ======================================
// AI ASSISTANT API
// ======================================

app.post("/api/assistant", async (req, res) => {
  try {
    const {
      message,
      currentFloor,
      history = [],
      image
    } = req.body;

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

    // Keep only valid text conversation history.
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
          "\n\nGuest current floor: " +
          (currentFloor || "Not provided")
      },
      ...safeHistory
    ];

    // ======================================
    // IMAGE INPUT
    // ======================================

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

    // ======================================
    // SELECT AI MODEL
    // ======================================

    const model = image ? GROQ_VISION_MODEL : GROQ_MODEL;

    console.log("Using AI model:", model);

    const data = await callGroq(messages, model);

    if (!data || typeof data.reply !== "string") {
      throw new Error("Invalid AI response format");
    }

    // ======================================
    // VALIDATE ELEVATOR REQUEST
    // ======================================

    if (
      data.action === "confirm_lift" ||
      data.action === "submit"
    ) {
      if (
        !validFloor(data.destinationFloor) ||
        !validFloor(currentFloor)
      ) {
        return res.status(400).json({
          error: "Invalid elevator floor request"
        });
      }

      if (Number(currentFloor) === Number(data.destinationFloor)) {
        return res.json({
          action: "chat",
          reply: "You are already here!"
        });
      }

      data.currentFloor = Number(currentFloor);
      data.destinationFloor = Number(data.destinationFloor);
    }

    // ======================================
    // VALIDATE REPORT CONFIRMATION
    // ======================================

    if (data.action === "confirm_report") {
      const report = data.report;

      if (
        !report ||
        !REPORT_TYPES.includes(report.type) ||
        !validFloor(report.incidentFloor) ||
        typeof report.location !== "string" ||
        !report.location.trim()
      ) {
        return res.status(400).json({
          error: "Incomplete report information"
        });
      }

      if (
        typeof report.description !== "string" &&
        report.description !== undefined
      ) {
        return res.status(400).json({
          error: "Invalid report description"
        });
      }

      data.report = {
        type: report.type,
        incidentFloor: Number(report.incidentFloor),
        location: report.location.trim().slice(0, 300),
        description: String(report.description || "").trim().slice(0, 2000)
      };
    }

    // Do not allow the AI to trigger email submission directly.
    if (data.action === "report") {
      return res.json({
        action: "chat",
        reply: "I have prepared the report details. Please confirm the report summary before it is submitted."
      });
    }

    return res.json(data);

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "AI assistant is temporarily unavailable",
      details: error.message
    });
  }
});

// ======================================
// REPORT EMAIL API
// ======================================

app.post("/api/report", async (req, res) => {
  try {
    if (!transporter) {
      return res.status(503).json({
        error: "Email service is not configured"
      });
    }

    const {
      type,
      incidentFloor,
      location,
      description,
      image
    } = req.body;

    // Validate report type.
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({
        error: "Invalid report type"
      });
    }

    // Validate floor.
    if (!validFloor(incidentFloor)) {
      return res.status(400).json({
        error: "Invalid incident floor"
      });
    }

    // Validate location.
    if (
      typeof location !== "string" ||
      !location.trim()
    ) {
      return res.status(400).json({
        error: "Incident location is required"
      });
    }

    // Validate description.
    if (
      description !== undefined &&
      typeof description !== "string"
    ) {
      return res.status(400).json({
        error: "Invalid report description"
      });
    }

    // Validate image.
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

    // ======================================
    // EMAIL CONTENT
    // ======================================

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: HOTEL_EMAIL,
      subject: `New Hotel Report - ${reportId}`,

      html: `
        <h2>Hotel Incident Report</h2>

        <p><b>Report ID:</b> ${escapeHTML(reportId)}</p>
        <p><b>Date:</b> ${escapeHTML(dateTime)}</p>
        <p><b>Type:</b> ${escapeHTML(type)}</p>
        <p><b>Floor:</b> ${Number(incidentFloor)}</p>
        <p><b>Location:</b> ${escapeHTML(location)}</p>
        <p><b>Description:</b> ${escapeHTML(description || "Not provided")}</p>
        <p><b>Reporter:</b> Anonymous</p>
      `
    };

    // ======================================
    // IMAGE ATTACHMENT
    // ======================================

    if (image) {
      const matches = image.match(
        /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
      );

      if (matches) {
        const extension =
          matches[1].toLowerCase() === "jpeg"
            ? "jpg"
            : matches[1].toLowerCase();

        mailOptions.attachments = [
          {
            filename: `report-${reportId}.${extension}`,
            content: Buffer.from(matches[2], "base64"),
            contentType: `image/${matches[1].toLowerCase()}`
          }
        ];
      }
    }

    // ======================================
    // SEND EMAIL
    // ======================================

    await transporter.sendMail(mailOptions);

    console.log("Report email sent successfully:", reportId);

    return res.json({
      success: true,
      reportId,
      dateTime,
      message: "Report submitted successfully"
    });

  } catch (error) {
    console.error("Report error:", error);

    return res.status(500).json({
      error: "Unable to submit report",
      details: error.message
    });
  }
});

// ======================================
// ERROR HANDLER
// ======================================

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

// ======================================
// START SERVER
// ======================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Vision model: ${GROQ_VISION_MODEL}`);
  console.log(`Chat model: ${GROQ_MODEL}`);
  console.log(`Email configured: ${Boolean(transporter)}`);
});
