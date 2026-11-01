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
  process.env.GROQ_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

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

app.use(express.json({limit:"10mb"}));

// ======================================
// EMAIL CONFIGURATION
// ======================================

let transporter = null;

if (process.env.EMAIL_USER &&
    process.env.EMAIL_APP_PASSWORD) {

  transporter = nodemailer.createTransport({
    host:process.env.SMTP_HOST || "smtp.gmail.com",
    port:Number(process.env.SMTP_PORT || 465),
    secure:Number(process.env.SMTP_PORT || 465) === 465,

    auth:{
      user:process.env.EMAIL_USER,
      pass:process.env.EMAIL_APP_PASSWORD
    }
  });
}

// ======================================
// HELPER FUNCTIONS
// ======================================

function validFloor(floor) {
  return Number.isInteger(Number(floor)) &&
    Number(floor) >= 1 &&
    Number(floor) <= 3;
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"']/g,char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[char]);
}

function validImage(image) {
  return typeof image === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image);
}

function generateReportId() {
  return "HOTEL-" +
    Date.now().toString().slice(-8) +
    "-" +
    Math.floor(100 + Math.random() * 900);
}

// ======================================
// GROQ AI FUNCTION
// ======================================

async function callGroq(messages,model) {

  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method:"POST",

      headers:{
        "Authorization":`Bearer ${GROQ_API_KEY}`,
        "Content-Type":"application/json"
      },

      body:JSON.stringify({
        model,
        messages,
        temperature:0.3,
        response_format:{type:"json_object"}
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Groq error:",result);

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

// ======================================
// AI SYSTEM PROMPT
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for an Intelligent Elevator System.

Communicate in the same language as the guest.
Support English and Bahasa Melayu.

HOTEL FLOOR DIRECTORY:

FLOOR 1:
${FACILITIES[1].join(", ")}

FLOOR 2:
${FACILITIES[2].join(", ")}

FLOOR 3:
${FACILITIES[3].join(", ")}

LOCATION RULES:
1. Answer facility location questions using this directory.
2. Never invent a facility or its floor.
3. If a facility is not listed, explain that you cannot find it in the directory.
4. Cafe is on Floor 1.
5. Guest rooms are on Floor 2.
6. Swimming pool and gymnasium are on Floor 3.

ELEVATOR RULES:
1. The website provides the guest's current floor.
2. Never guess the current floor.
3. If the guest asks to go to a floor, identify the destination.
4. If the guest asks to go to a facility, identify its floor from the directory.
5. Before requesting the elevator, tell the guest the current floor and destination floor.
6. Ask the guest to confirm before submitting the request.
7. If the guest's current floor equals the destination, say:
   "You are already here!"
8. Never claim the lift has moved or arrived.
9. The website will send the actual request to Firebase.
10. Never submit an elevator request without confirmation.

REPORT RULES:
1. Support Lost Item, Suspicious Person, Facility Damage,
   General Complaint and Other.
2. Ask for report type, incident floor and incident location.
3. Do not ask for guest name, phone number, email or room number.
4. Ask for confirmation before submitting a report.
5. For suspicious persons, describe observations only.
   Never identify or accuse anyone based on appearance.
6. If there is immediate danger, advise the guest to move to a safe
   location and contact hotel security.

IMAGE RULES:
1. If an image is supplied, describe only what is visible.
2. Do not invent details.
3. If the guest reports a lost item or damaged facility,
   help collect the report information.

RESPONSE FORMAT:
Return valid JSON only.

NORMAL CHAT:
{
  "action":"chat",
  "reply":"Your answer"
}

ELEVATOR REQUEST - WAITING FOR CONFIRMATION:
{
  "action":"confirm_lift",
  "reply":"You are currently on Floor 2. Do you want to go to Floor 3? Please confirm.",
  "destinationFloor":3
}

ELEVATOR REQUEST - USER HAS CONFIRMED:
{
  "action":"submit",
  "reply":"Your elevator request is confirmed.",
  "currentFloor":2,
  "destinationFloor":3
}

REPORT WAITING FOR CONFIRMATION:
{
  "action":"chat",
  "reply":"Please confirm the report details before submission."
}

REPORT AFTER CONFIRMATION:
{
  "action":"report",
  "reply":"Your report is ready to submit.",
  "report":{
    "type":"Lost Item",
    "incidentFloor":1,
    "location":"Main Entrance",
    "description":"A black wallet was lost."
  }
}

IMPORTANT:
- Only use action "confirm_lift" when asking the guest to confirm.
- Only use action "submit" after the guest explicitly confirms.
- Never use action "submit" if current floor equals destination floor.
- Only use action "report" after the guest explicitly confirms.
- Do not claim that a request has been sent to Firebase.
- Return valid JSON only.
`;

// ======================================
// HOME PAGE
// ======================================

app.get("/",(req,res) => {
  res.json({
    status:"online",
    message:"Intelligent Elevator AI Backend is running"
  });
});

// ======================================
// HEALTH CHECK
// ======================================

app.get("/api/health",(req,res) => {
  res.json({
    status:"healthy",
    aiConfigured:Boolean(GROQ_API_KEY),
    emailConfigured:Boolean(transporter)
  });
});

// ======================================
// AI ASSISTANT API
// ======================================

app.post("/api/assistant",async(req,res) => {

  try {

    const {
      message,
      currentFloor,
      history = [],
      image
    } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error:"Message is required"
      });
    }

    if (
      currentFloor !== undefined &&
      currentFloor !== null &&
      !validFloor(currentFloor)
    ) {
      return res.status(400).json({
        error:"Invalid current floor"
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        error:"History must be an array"
      });
    }

    const safeHistory = history
      .filter(item =>
        item &&
        ["user","assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-10);

    const messages = [
      {
        role:"system",
        content:
          SYSTEM_PROMPT +
          "\n\nGuest current floor: " +
          (currentFloor || "Not provided")
      },
      ...safeHistory
    ];

    if (image) {

      if (!validImage(image)) {
        return res.status(400).json({
          error:"Unsupported image format"
        });
      }

      messages.push({
        role:"user",
        content:[
          {
            type:"text",
            text:message
          },
          {
            type:"image_url",
            image_url:{url:image}
          }
        ]
      });

    } else {

      messages.push({
        role:"user",
        content:message
      });

    }

    const model = image
      ? GROQ_VISION_MODEL
      : GROQ_MODEL;

    const data = await callGroq(messages,model);

    if (!data || typeof data.reply !== "string") {
      throw new Error("Invalid AI response format");
    }

    // Validate elevator request before returning it.
    if (
      data.action === "confirm_lift" ||
      data.action === "submit"
    ) {

      if (
        !validFloor(data.destinationFloor) ||
        !validFloor(currentFloor)
      ) {
        return res.status(400).json({
          error:"Invalid elevator floor request"
        });
      }

      if (
        Number(currentFloor) === Number(data.destinationFloor)
      ) {
        return res.json({
          action:"chat",
          reply:"You are already here!"
        });
      }

      data.currentFloor = Number(currentFloor);
      data.destinationFloor = Number(data.destinationFloor);
    }

    // Validate report.
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
          error:"Incomplete report information"
        });
      }

      data.report = {
        type:report.type,
        incidentFloor:Number(report.incidentFloor),
        location:report.location.trim(),
        description:String(report.description || "")
      };
    }

    return res.json(data);

  } catch(error) {

    console.error("Assistant error:",error);

    return res.status(500).json({
      error:"AI assistant is temporarily unavailable",
      details:error.message
    });

  }

});

// ======================================
// REPORT API
// ======================================

app.post("/api/report",async(req,res) => {

  try {

    if (!transporter) {
      return res.status(503).json({
        error:"Email service is not configured"
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
        error:"Invalid report type"
      });
    }

    if (!validFloor(incidentFloor)) {
      return res.status(400).json({
        error:"Invalid incident floor"
      });
    }

    if (
      typeof location !== "string" ||
      !location.trim()
    ) {
      return res.status(400).json({
        error:"Incident location is required"
      });
    }

    if (image && !validImage(image)) {
      return res.status(400).json({
        error:"Invalid image format"
      });
    }

    const reportId = generateReportId();

    const dateTime = new Intl.DateTimeFormat("en-MY",{
      dateStyle:"full",
      timeStyle:"long",
      timeZone:"Asia/Kuala_Lumpur"
    }).format(new Date());

    const mailOptions = {
      from:process.env.EMAIL_USER,
      to:HOTEL_EMAIL,
      subject:`New Hotel Report - ${reportId}`,

      html:`
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

    if (image) {

      const matches = image.match(
        /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
      );

      if (matches) {
        mailOptions.attachments = [{
          filename:`report-${reportId}.${matches[1]}`,
          content:Buffer.from(matches[2],"base64")
        }];
      }
    }

    await transporter.sendMail(mailOptions);

    return res.json({
      success:true,
      reportId,
      dateTime,
      message:"Report submitted successfully"
    });

  } catch(error) {

    console.error("Report error:",error);

    return res.status(500).json({
      error:"Unable to submit report",
      details:error.message
    });

  }

});

// ======================================
// ERROR HANDLER
// ======================================

app.use((error,req,res,next) => {
  console.error("Server error:",error.message);

  res.status(500).json({
    error:"Internal server error"
  });
});

// ======================================
// START SERVER
// ======================================

app.listen(PORT,() => {
  console.log(
    `Intelligent Elevator AI Backend running on port ${PORT}`
  );

  console.log(`AI configured: ${Boolean(GROQ_API_KEY)}`);
  console.log(`Email configured: ${Boolean(transporter)}`);
});
