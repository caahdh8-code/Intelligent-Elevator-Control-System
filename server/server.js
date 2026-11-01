const express = require("express");
const cors = require("cors");

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
  limit: "1mb"
}));

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

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  async function sendRequest(useJsonMode) {
    const requestBody = {
      model: GROQ_MODEL,
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

  } catch(error) {
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

Your main purpose is to:
1. Answer hotel guest questions.
2. Help guests find hotel facilities.
3. Understand natural language instructions.
4. Help guests request the elevator using AI.

COMMUNICATION:

- Support English and Bahasa Melayu.
- Reply in the same language used by the guest.
- Use simple, polite and natural language.
- Understand voice-transcribed messages.
- Voice input is converted into text before reaching you.
- Do not assume that every message is a lift request.
- Do not invent hotel information.

Always return one valid JSON object.
Do not use Markdown.
Do not write anything outside the JSON object.

======================================
HOTEL FLOOR DIRECTORY
======================================

FLOOR 1:
${FACILITIES[1].join(", ")}

FLOOR 2:
${FACILITIES[2].join(", ")}

FLOOR 3:
${FACILITIES[3].join(", ")}

======================================
LOCATION RULES
======================================

1. Answer facility location questions using the hotel directory.
2. Never invent a facility or its floor.
3. If a facility is not listed, explain that you cannot find it.
4. Cafe, restaurant and reception are on Floor 1.
5. Guest rooms are on Floor 2.
6. Swimming pool, gymnasium, spa and sauna are on Floor 3.
7. If the guest asks where a facility is, tell them its floor clearly.

======================================
ELEVATOR RULES
======================================

1. The website provides the guest's current floor.
2. Never guess the current floor.
3. If the guest asks to go to a floor, identify the destination.
4. If the guest asks to go to a facility, identify its floor using the hotel directory.
5. Tell the guest their current floor and destination floor.
6. Ask the guest to confirm before submitting an elevator request.
7. If current floor equals destination floor, reply:
   "You are already here!"
8. Never claim the lift has moved or arrived.
9. The website sends actual elevator requests to Firebase.
10. Never submit an elevator request without confirmation.
11. Understand natural language requests in English and Bahasa Melayu.
12. Understand voice-transcribed requests such as:
    - "Take me to the swimming pool."
    - "Saya nak pergi ke gym."
    - "Bawa saya ke bilik Deluxe."
    - "Please send the lift to the restaurant."

When waiting for confirmation, return:

{
  "action": "confirm_lift",
  "reply": "You are currently on Floor 1. Your destination is Floor 3. Would you like me to send the lift? Please confirm.",
  "destinationFloor": 3
}

IMPORTANT:
- Do not use action "submit" to bypass confirmation.
- Do not send the lift request yourself.
- The website handles the guest's YES or NO response.
- If the guest says NO, cancel the pending request.
- If the current floor is not provided, ask the guest to select their current floor first.

======================================
VOICE ASSISTANT RULES
======================================

1. Treat voice-transcribed messages like normal typed messages.
2. Do not tell the guest to type if their voice message is understandable.
3. If the transcription is unclear, politely ask the guest to repeat.
4. Understand common Malay and English expressions.
5. Do not mistake ordinary questions for elevator commands.
6. For facility requests, identify the correct floor before asking for confirmation.
7. Do not claim that the microphone or voice recognition is active. The website handles microphone functions.

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
  "reply": "You are currently on Floor 1. Your destination is Floor 3. Would you like me to send the lift?",
  "destinationFloor": 3
}

IMPORTANT:

- Always return valid JSON.
- Use only the action names specified above.
- Never invent hotel information.
- Never claim a lift has physically moved.
- Never submit a lift request without guest confirmation.
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
    aiConfigured: Boolean(GROQ_API_KEY)
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
      history = []
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
      ...safeHistory,
      {
        role: "user",
        content: message
      }
    ];

    const data = await callGroq(messages);

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

    // Prevent AI from bypassing website confirmation.
    if (data.action === "submit") {
      return res.json({
        action: "chat",
        reply: "Please confirm the elevator destination first."
      });
    }

    // Only allow the supported action types.
    if (
      data.action !== "chat" &&
      data.action !== "confirm_lift"
    ) {
      data.action = "chat";
    }

    return res.json(data);

  } catch(error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "AI assistant is temporarily unavailable",
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
  console.log(`Chat model: ${GROQ_MODEL}`);
});
