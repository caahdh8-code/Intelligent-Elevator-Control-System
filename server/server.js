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
    floor !== null &&
    floor !== undefined &&
    floor !== "" &&
    Number.isInteger(Number(floor)) &&
    Number(floor) >= 1 &&
    Number(floor) <= 3
  );
}

// ======================================
// DETECT CURRENT FLOOR FROM USER MESSAGE
// ======================================

function extractCurrentFloor(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  const text = message.toLowerCase();

  const wordFloors = {
    one: 1,
    first: 1,
    satu: 1,
    dua: 2,
    two: 2,
    second: 2,
    tiga: 3,
    three: 3,
    third: 3
  };

  const patterns = [
    /\b(?:i am|i'm|im|currently at|currently on|from|starting from|my current floor is)\s+(?:floor\s*)?([1-3])\b/i,

    /\b(?:saya|aku)\s+(?:sekarang\s+)?(?:berada\s+)?(?:di|dari|dekat)\s+(?:tingkat\s*)?([1-3])\b/i,

    /\b(?:sekarang|current floor)\s*(?:saya\s*)?(?:ialah|adalah|is)?\s*(?:floor|tingkat)?\s*([1-3])\b/i,

    /\b(?:tingkat|floor)\s*([1-3])\s*(?:sekarang|current)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  const wordPattern =
    /\b(?:i am|i'm|im|from|at|saya|aku|di|dari)\s+(?:floor\s*|tingkat\s*)?(one|first|satu|two|second|dua|three|third|tiga)\b/i;

  const wordMatch = text.match(wordPattern);

  if (wordMatch) {
    return wordFloors[wordMatch[1].toLowerCase()] || null;
  }

  return null;
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
    const error = new Error(
      "AI did not return a valid JSON object"
    );

    error.code = "invalid_json_response";
    throw error;
  }

  cleaned = cleaned.substring(
    firstBrace,
    lastBrace + 1
  );

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
    throw new Error(
      "GROQ_API_KEY is missing in Render Environment"
    );
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
        result.error?.message ||
        "AI service request failed"
      );

      error.code = result.error?.code;
      error.status = response.status;

      throw error;
    }

    const content =
      result.choices?.[0]?.message?.content;

    return parseAIJson(content);
  }

  try {
    return await sendRequest(true);

  } catch (error) {
    console.error(
      "Groq first attempt failed:",
      error.message
    );

    if (
      error.code === "json_validate_failed" ||
      error.code === "invalid_json_response"
    ) {
      console.log(
        "Retrying Groq without JSON mode..."
      );

      return await sendRequest(false);
    }

    throw error;
  }
}

// ======================================
// AI SYSTEM PROMPT
// ======================================

const SYSTEM_PROMPT = `
You are the intelligent AI assistant for a hotel elevator system.

Your responsibilities:

1. Answer hotel-related questions.
2. Help guests find hotel facilities.
3. Understand natural language.
4. Understand Malay and English.
5. Understand mixed Malay-English sentences.
6. Help guests request elevator transportation.
7. Understand voice-transcribed messages.

Always return one valid JSON object.
Never use Markdown.
Never write outside the JSON object.

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
UNDERSTANDING USER INTENT
======================================

Understand what the guest means, not only exact keywords.

Examples:

- "Saya nak pergi cafe."
- "Boleh bawa saya ke cafe?"
- "I want to get some coffee."
- "Take me to the restaurant."
- "Saya nak makan."
- "I want to exercise."
- "Where can I swim?"
- "Can you send me to the spa?"
- "Saya nak berehat dekat sauna."

Recognize natural language, common expressions,
short commands, informal language and common spelling mistakes.

Do not assume every message is an elevator request.

======================================
HOTEL LOCATION RULES
======================================

FLOOR 1:
Cafe, Restaurant, Reception, Front Desk,
Main Entrance, Waiting Lounge, Meeting Room,
Hotel Office and Public Toilet.

FLOOR 2:
Standard Room, Deluxe Room, Twin Room,
Family Room, Housekeeping Room, Laundry Room
and Guest Lounge.

FLOOR 3:
Swimming Pool, Gymnasium, Spa and Massage,
Sauna, Rooftop Restaurant, Sky Lounge
and Kids Playroom.

Rules:

- Never invent a hotel facility.
- Answer location questions using this directory.
- Tell the guest the correct floor.
- If the facility is not listed, explain politely.
- Do not confuse a location question with a lift request.

======================================
CURRENT FLOOR RULES
======================================

The website may provide the guest's current floor.

The guest may also state their current floor
in their message.

Examples:

- "Saya di tingkat 2."
- "Saya berada di floor 1."
- "I'm currently on Floor 3."
- "I am at the second floor."
- "My current floor is 1."

IMPORTANT:

1. If the guest explicitly states their current floor,
   use the floor stated in their latest message.

2. Otherwise, use the current floor provided by the website.

3. Never guess the current floor.

4. If current floor is unknown, ask the guest.

5. Valid floors are only Floor 1, Floor 2 and Floor 3.

======================================
SMART ELEVATOR RULES
======================================

When a guest requests elevator transportation:

1. Understand the requested destination.
2. Identify the destination floor from the hotel directory.
3. Identify the current floor.
4. Check whether both floors are valid.
5. If current floor is unknown, ask the guest.
6. If destination is unclear, ask for clarification.
7. If current floor equals destination floor,
   reply that the guest is already there.
8. If both floors are valid and different,
   ask the guest for confirmation.

Examples:

User:
"Saya di tingkat 2 dan nak pergi cafe."

Current Floor: 2
Destination Floor: 1

User:
"I'm on Floor 1. Take me to the gym."

Current Floor: 1
Destination Floor: 3

User:
"Saya dari tingkat 3 nak pergi reception."

Current Floor: 3
Destination Floor: 1

User:
"Take me to the swimming pool."

Destination Floor: 3

If current floor is unknown,
ask the guest which floor they are currently on.

======================================
ELEVATOR CONFIRMATION
======================================

When both floors are valid and different,
return:

{
  "action": "confirm_lift",
  "reply": "You are currently on Floor 2. Your destination is Floor 1 (Cafe). Would you like me to send the lift?",
  "destinationFloor": 1
}

Rules:

- Always ask for confirmation.
- Never submit a request directly.
- Never use action "submit".
- The website handles YES and NO.
- Never claim the lift has moved.
- Never claim the lift has arrived.
- The website sends the actual request to Firebase.

======================================
VOICE ASSISTANT
======================================

Voice messages are already converted into text.

Treat voice messages exactly like typed messages.

Understand Malay and English voice transcripts.

If a voice transcript is unclear,
ask the guest to repeat the message.

Do not claim that the microphone is active.

======================================
GENERAL HOTEL QUESTIONS
======================================

For normal hotel questions:

- Reply naturally.
- Be polite and helpful.
- Use simple language.
- Answer only using known hotel information.
- Do not create elevator requests unnecessarily.

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

Always return valid JSON.
Only use action "chat" or "confirm_lift".
Never bypass confirmation.
Never invent hotel information.
Never claim physical elevator movement.
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

    if (
      !message ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (
      currentFloor !== undefined &&
      currentFloor !== null &&
      currentFloor !== "" &&
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

    // ======================================
    // SAFE CHAT HISTORY
    // ======================================

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-10);

    // ======================================
    // DETECT CURRENT FLOOR
    // ======================================

    const detectedFloor =
      extractCurrentFloor(message);

    const effectiveCurrentFloor =
      detectedFloor ||
      (
        validFloor(currentFloor)
          ? Number(currentFloor)
          : null
      );

    console.log("User message:", message);
    console.log("Website current floor:", currentFloor);
    console.log("Detected current floor:", detectedFloor);
    console.log("Effective current floor:", effectiveCurrentFloor);

    // ======================================
    // PREPARE AI MESSAGES
    // ======================================

    const messages = [
      {
        role: "system",

        content:
          SYSTEM_PROMPT +

          "\n\nGuest current floor: " +
          (
            effectiveCurrentFloor ||
            "Not provided"
          ) +

          "\n\nIf the latest user message explicitly " +
          "states a current floor, use that floor. " +

          "\nIf the current floor is not known, " +
          "ask the guest instead of guessing."
      },

      ...safeHistory,

      {
        role: "user",
        content: message
      }
    ];

    // ======================================
    // CALL GROQ AI
    // ======================================

    const data = await callGroq(messages);

    if (
      !data ||
      typeof data.reply !== "string"
    ) {
      throw new Error(
        "Invalid AI response format"
      );
    }

    console.log("AI action:", data.action);
    console.log("AI reply:", data.reply);
    console.log(
      "AI destination:",
      data.destinationFloor
    );

    // ======================================
    // VALIDATE ELEVATOR REQUEST
    // ======================================

    if (
      data.action === "confirm_lift" ||
      data.action === "submit"
    ) {

      // Current floor is missing.
      if (!validFloor(effectiveCurrentFloor)) {
        return res.json({
          action: "chat",

          reply:
            "May I know which floor you are currently on? " +
            "/ Boleh saya tahu anda berada di tingkat berapa sekarang?"
        });
      }

      // Destination is invalid.
      if (!validFloor(data.destinationFloor)) {
        return res.json({
          action: "chat",

          reply:
            "May I know which floor or hotel facility " +
            "you would like to visit?"
        });
      }

      // Same floor.
      if (
        Number(effectiveCurrentFloor) ===
        Number(data.destinationFloor)
      ) {
        return res.json({
          action: "chat",
          reply: "You are already here!"
        });
      }

      // Attach validated floor information.
      data.currentFloor =
        Number(effectiveCurrentFloor);

      data.destinationFloor =
        Number(data.destinationFloor);
    }

    // ======================================
    // PREVENT DIRECT SUBMISSION
    // ======================================

    if (data.action === "submit") {
      return res.json({
        action: "chat",

        reply:
          "Please confirm the elevator destination first."
      });
    }

    // ======================================
    // ALLOW SUPPORTED ACTIONS ONLY
    // ======================================

    if (
      data.action !== "chat" &&
      data.action !== "confirm_lift"
    ) {
      data.action = "chat";
      delete data.destinationFloor;
      delete data.currentFloor;
    }

    return res.json(data);

  } catch (error) {
    console.error(
      "Assistant error:",
      error
    );

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
  console.error(
    "Server error:",
    error.message
  );

  res.status(500).json({
    error: "Internal server error"
  });
});

// ======================================
// START SERVER
// ======================================

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );

  console.log(
    `Chat model: ${GROQ_MODEL}`
  );
});
