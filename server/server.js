const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

const WEBSITE_URL =
  process.env.WEBSITE_URL || "https://caahdh8-code.github.io";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === WEBSITE_URL ||
      origin === "https://caahdh8-code.github.io"
    ) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "1mb" }));

// ======================================
// HOTEL FACILITY DIRECTORY
// ======================================

const FACILITIES = [
  {
    floor: 1,
    name: "Main Entrance",
    aliases: ["main entrance", "entrance", "pintu masuk"]
  },
  {
    floor: 1,
    name: "Reception",
    aliases: ["reception", "front desk", "kaunter", "kaunter reception"]
  },
  {
    floor: 1,
    name: "Waiting Lounge",
    aliases: ["waiting lounge", "ruang menunggu"]
  },
  {
    floor: 1,
    name: "Restaurant",
    aliases: ["restaurant", "restoran", "tempat makan"]
  },
  {
    floor: 1,
    name: "Cafe",
    aliases: ["cafe", "café", "kafe", "coffee shop", "kedai kopi"]
  },
  {
    floor: 1,
    name: "Meeting Room",
    aliases: ["meeting room", "bilik meeting", "bilik mesyuarat"]
  },
  {
    floor: 1,
    name: "Hotel Office",
    aliases: ["hotel office", "office", "pejabat"]
  },
  {
    floor: 1,
    name: "Public Toilet",
    aliases: ["public toilet", "toilet", "tandas", "bilik air"]
  },
  {
    floor: 2,
    name: "Standard Room",
    aliases: ["standard room", "standard", "bilik standard"]
  },
  {
    floor: 2,
    name: "Deluxe Room",
    aliases: ["deluxe room", "deluxe", "bilik deluxe"]
  },
  {
    floor: 2,
    name: "Twin Room",
    aliases: ["twin room", "twin", "bilik twin"]
  },
  {
    floor: 2,
    name: "Family Room",
    aliases: ["family room", "family", "bilik family", "bilik keluarga"]
  },
  {
    floor: 2,
    name: "Housekeeping Room",
    aliases: ["housekeeping room", "housekeeping"]
  },
  {
    floor: 2,
    name: "Laundry Room",
    aliases: ["laundry room", "laundry", "dobi"]
  },
  {
    floor: 2,
    name: "Guest Lounge",
    aliases: ["guest lounge", "ruang tetamu"]
  },
  {
    floor: 3,
    name: "Swimming Pool",
    aliases: ["swimming pool", "pool", "swimming", "kolam", "kolam renang"]
  },
  {
    floor: 3,
    name: "Gymnasium",
    aliases: ["gymnasium", "gym", "gim", "fitness", "fitness room"]
  },
  {
    floor: 3,
    name: "Spa and Massage",
    aliases: ["spa and massage", "spa", "massage", "urut"]
  },
  {
    floor: 3,
    name: "Sauna",
    aliases: ["sauna"]
  },
  {
    floor: 3,
    name: "Rooftop Restaurant",
    aliases: ["rooftop restaurant", "rooftop", "restoran rooftop"]
  },
  {
    floor: 3,
    name: "Sky Lounge",
    aliases: ["sky lounge"]
  },
  {
    floor: 3,
    name: "Kids Playroom",
    aliases: [
      "kids playroom",
      "playroom",
      "kids room",
      "bilik permainan kanak kanak"
    ]
  }
];

// ======================================
// TEXT NORMALISATION
// ======================================

function normaliseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandShortforms(value) {
  let text = " " + normaliseText(value) + " ";

  const replacements = [
    [/\bsy\b/g, " saya "],
    [/\bsye\b/g, " saya "],
    [/\baku\b/g, " saya "],
    [/\bkau\b/g, " awak "],
    [/\bko\b/g, " awak "],
    [/\bdye\b/g, " dia "],
    [/\bdorg\b/g, " mereka "],
    [/\bdri\b/g, " dari "],
    [/\bdr\b/g, " dari "],
    [/\bkt\b/g, " di "],
    [/\bdkt\b/g, " di "],
    [/\bkat\b/g, " di "],
    [/\bnk\b/g, " nak "],
    [/\bngk\b/g, " nak "],
    [/\bnek\b/g, " nak "],
    [/\bgi\b/g, " pergi "],
    [/\bg\b/g, " pergi "],
    [/\bpegi\b/g, " pergi "],
    [/\bpi\b/g, " pergi "],
    [/\bbawak\b/g, " bawa "],
    [/\bbwok\b/g, " bawa "],
    [/\bmn\b/g, " mana "],
    [/\bmaner\b/g, " mana "],
    [/\btkt\b/g, " tingkat "],
    [/\bbrp\b/g, " berapa "],
    [/\bape\b/g, " apa "],
    [/\bskrg\b/g, " sekarang "],
    [/\bskang\b/g, " sekarang "],
    [/\bx\b/g, " tidak "],
    [/\btak\b/g, " tidak "],
    [/\btk\b/g, " tidak "],
    [/\bdh\b/g, " sudah "],
    [/\bdah\b/g, " sudah "],
    [/\bblm\b/g, " belum "],
    [/\bje\b/g, " sahaja "],
    [/\bjer\b/g, " sahaja "],
    [/\bpon\b/g, " pun "]
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, " ").trim();
}

// ======================================
// FLOOR VALIDATION
// ======================================

function validFloor(value) {
  const floor = Number(value);

  return Number.isInteger(floor) &&
    floor >= 1 &&
    floor <= 3;
}

// ======================================
// DETECT CURRENT FLOOR
// ======================================

function detectCurrentFloor(message) {
  const text = expandShortforms(message);

  const patterns = [
    /\b(?:saya|aku|awak|i am|im)\s+(?:sekarang\s+)?(?:berada\s+)?(?:di|dekat|dari|from|on|at)\s+(?:floor|level|tingkat)?\s*([1-3])\b/,
    /\b(?:dari|from)\s+(?:floor|level|tingkat)\s*([1-3])\b/,
    /\b(?:current floor|my floor|floor saya|tingkat saya)\s*(?:is|ialah|adalah)?\s*([1-3])\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  const words = {
    satu: 1,
    pertama: 1,
    one: 1,
    dua: 2,
    kedua: 2,
    two: 2,
    tiga: 3,
    ketiga: 3,
    three: 3
  };

  const wordMatch = text.match(
    /\b(?:saya|aku|i am|im)\s+(?:sekarang\s+)?(?:berada\s+)?(?:di|dekat|dari|from|on|at)\s+(?:floor|level|tingkat)?\s*(satu|pertama|one|dua|kedua|two|tiga|ketiga|three)\b/
  );

  if (wordMatch) return words[wordMatch[1]];

  return null;
}

// ======================================
// DETECT DESTINATION FLOOR
// ======================================

function detectDestinationFloor(message) {
  const text = expandShortforms(message);

  const patterns = [
    /\b(?:nak|mahu|ingin|pergi|go|travel|head)\s+(?:pergi\s+)?(?:ke|to)?\s*(?:floor|level|tingkat)\s*([1-3])\b/,
    /\b(?:bawa|hantar|take|send)\s+(?:saya|aku|me)?\s*(?:ke|to)\s*(?:floor|level|tingkat)\s*([1-3])\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

// ======================================
// FACILITY DETECTION
// ======================================

function findFacility(message) {
  const text = " " + expandShortforms(message) + " ";
  const matches = [];

  for (const facility of FACILITIES) {
    for (const alias of facility.aliases) {
      const name = normaliseText(alias);

      if (text.includes(" " + name + " ")) {
        matches.push({
          ...facility,
          matchedAlias: alias,
          length: name.length
        });
      }
    }
  }

  matches.sort((a, b) => b.length - a.length);

  return matches[0] || null;
}

// ======================================
// INTENT DETECTION
// ======================================

function isLocationQuestion(message) {
  const text = expandShortforms(message);

  return (
    /\b(where|which floor|what floor|located|location)\b/.test(text) ||
    /\b(mana|di mana|dekat mana|tingkat berapa|floor berapa|berapa tingkat)\b/.test(text)
  );
}

function isTravelCommand(message) {
  const text = expandShortforms(message);

  return (
    /\b(take me|bring me|send me|i want to go|i wanna go|i need to go|go to|head to|call the lift|call elevator|take us|bring us)\b/.test(text) ||
    /\b(nak pergi|mahu pergi|ingin pergi|bawa saya|bawa awak|hantar saya|saya nak|saya mahu|pergi ke|nak ke|panggil lif|hantar lif|tolong bawa|tolong hantar)\b/.test(text)
  );
}

// ======================================
// LANGUAGE DETECTION
// ======================================

function detectLanguage(message) {
  const text = expandShortforms(message);

  if (/\b(saya|awak|nak|pergi|tingkat|dengan|mana|berapa|bawa|hantar|tolong|tidak)\b/.test(text)) {
    return "ms";
  }

  return "en";
}

// ======================================
// REPLY HELPERS
// ======================================

function askFloorReply(language) {
  return language === "ms"
    ? "Boleh beritahu saya awak berada di tingkat berapa sekarang?"
    : "May I know which floor you are currently on?";
}

function locationReply(facility, language) {
  return language === "ms"
    ? facility.name + " berada di Tingkat " +
      facility.floor + ". Nak saya bawa awak ke sana?"
    : facility.name + " is on Floor " +
      facility.floor + ". Would you like me to take you there?";
}

// ======================================
// GROQ AI
// ======================================

const SYSTEM_PROMPT = `
You are the Hotel AI Assistant for a three-floor hotel elevator.

Your job is to help hotel guests naturally.

LANGUAGES:
- Understand Bahasa Melayu and English.
- Understand informal Malay, slang, abbreviations and spelling mistakes.
- Understand short messages and speech-to-text sentences.
- Reply in the same language used by the guest.
- Be friendly, natural and concise.

MALAY SHORTFORM EXAMPLES:
- sy / sye = saya
- kt / kat / dkt = di / dekat
- dri / dr = dari
- nk / ngk = nak
- gi / g / pegi = pergi
- mn = mana
- brp = berapa
- tkt = tingkat
- x / tak = tidak

HOTEL DIRECTORY:

FLOOR 1:
Main Entrance, Reception, Waiting Lounge, Restaurant,
Cafe, Meeting Room, Hotel Office, Public Toilet.

FLOOR 2:
Standard Room, Deluxe Room, Twin Room, Family Room,
Housekeeping Room, Laundry Room, Guest Lounge.

FLOOR 3:
Swimming Pool, Gymnasium, Spa and Massage, Sauna,
Rooftop Restaurant, Sky Lounge, Kids Playroom.

EXAMPLES:
"cafe kt mn?" means the guest asks where the cafe is.
"sy nk g gym" means the guest wants to go to the gym.
"kolam renang tingkat berapa?" means the guest asks where the swimming pool is.
"brp tingkat bilik deluxe?" means the guest asks which floor has the deluxe room.

RULES:
- Answer questions about hotel facilities using the directory.
- Do not invent facilities or hotel information.
- Do not claim that the elevator has moved or arrived.
- Do not say a request was sent to Firebase unless the system confirms it.
- Do not ask for confirmation repeatedly.
- Never guess the guest's current floor.
- If the guest asks a general question, answer naturally.
`;

// ======================================
// GROQ API REQUEST
// ======================================

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in Render Environment");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 500
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Groq API request failed"
    );
  }

  return result.choices?.[0]?.message?.content || "";
}

// ======================================
// BASIC ROUTES
// ======================================

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
    model: GROQ_MODEL
  });
});

// ======================================
// AI ASSISTANT ROUTE
// ======================================

app.post("/api/assistant", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const history = Array.isArray(req.body.history)
      ? req.body.history
      : Array.isArray(req.body.chatHistory)
        ? req.body.chatHistory
        : [];

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-12);

    const language = detectLanguage(message);

    let currentFloor = validFloor(req.body.currentFloor)
      ? Number(req.body.currentFloor)
      : null;

    // An explicitly stated current floor in the message
    // takes priority over the website's selected value.
    const detectedCurrent = detectCurrentFloor(message);

    if (detectedCurrent !== null) {
      currentFloor = detectedCurrent;
    }

    const facility = findFacility(message);
    const locationQuestion = isLocationQuestion(message);
    const travelCommand = isTravelCommand(message);

    // --------------------------------------
    // LOCATION QUESTION
    // Example: "cafe kt mn?"
    // --------------------------------------

    if (facility && locationQuestion && !travelCommand) {
      return res.json({
        action: "offer_lift",
        reply: locationReply(facility, language),
        destinationFloor: facility.floor,
        facility: facility.name,
        currentFloor
      });
    }

    // --------------------------------------
    // DIRECT FACILITY TRAVEL
    // Example: "sy dri floor 2 nk ke cafe"
    // --------------------------------------

    if (facility && travelCommand) {
      if (!currentFloor) {
        return res.json({
          action: "ask_current_floor",
          reply: askFloorReply(language),
          destinationFloor: facility.floor,
          facility: facility.name
        });
      }

      if (currentFloor === facility.floor) {
        return res.json({
          action: "chat",
          reply: language === "ms"
            ? "Awak sudah berada di tingkat yang sama! " +
              facility.name + " berada di Tingkat " + facility.floor + "."
            : "You are already on the same floor! " +
              facility.name + " is on Floor " + facility.floor + ".",
          currentFloor
        });
      }

      return res.json({
        action: "send_lift",
        reply: language === "ms"
          ? "Baik! Saya sedang menghantar permintaan lif dari Tingkat " +
            currentFloor + " ke " + facility.name +
            " di Tingkat " + facility.floor + "."
          : "Okay! I am submitting your elevator request from Floor " +
            currentFloor + " to " + facility.name +
            " on Floor " + facility.floor + ".",
        currentFloor,
        destinationFloor: facility.floor,
        facility: facility.name
      });
    }

    // --------------------------------------
    // DIRECT FLOOR NUMBER TRAVEL
    // Example: "take me to floor 3"
    // --------------------------------------

    const destinationFloor = detectDestinationFloor(message);

    if (destinationFloor && travelCommand) {
      if (!currentFloor) {
        return res.json({
          action: "ask_current_floor",
          reply: askFloorReply(language),
          destinationFloor
        });
      }

      if (currentFloor === destinationFloor) {
        return res.json({
          action: "chat",
          reply: language === "ms"
            ? "Awak sudah berada di Tingkat " + destinationFloor + "!"
            : "You are already on Floor " + destinationFloor + "!",
          currentFloor
        });
      }

      return res.json({
        action: "send_lift",
        reply: language === "ms"
          ? "Baik! Permintaan lif dari Tingkat " +
            currentFloor + " ke Tingkat " +
            destinationFloor + " sedang dihantar."
          : "Okay! Your elevator request from Floor " +
            currentFloor + " to Floor " +
            destinationFloor + " is being submitted.",
        currentFloor,
        destinationFloor
      });
    }

    // --------------------------------------
    // NORMAL CONVERSATION WITH GROQ
    // --------------------------------------

    const aiMessages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...safeHistory,
      {
        role: "user",
        content: message
      }
    ];

    const aiReply = await callGroq(aiMessages);

    return res.json({
      action: "chat",
      reply: aiReply,
      currentFloor
    });

  } catch (error) {
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
  console.log("Server running on port " + PORT);
  console.log("Chat model: " + GROQ_MODEL);
});
