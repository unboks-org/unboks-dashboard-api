import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAgentPersonality } from "@/hooks/use-agent-personality";
import type { AgentPersonalitySettings } from "@/lib/api";
import { cn } from "@/lib/utils";

type Example = {
  label: string;
  text: string;
};

type Option = {
  label: string;
  recommended?: boolean;
};

type WizardQuestion = {
  id: string;
  question: string;
  options: Option[];
  customLabel?: string;
  customRows?: number;
  examples: Example[];
};

type Answer = {
  selected: string;
  custom: string;
};

type ChatMessage = {
  id: string;
  role: "client" | "agent";
  text: string;
};

const QUESTIONS: WizardQuestion[] = [
  {
    id: "formality",
    question: "How formal should your AI Agent sound?",
    options: [
      { label: "Very Formal" },
      { label: "Professional but Friendly", recommended: true },
      { label: "Friendly & Casual" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "Dear client, thank you for your message. We will look into this matter promptly.",
      },
      {
        label: "Example 2",
        text: "Hi there, thanks for reaching out. I’d be happy to help you with this.",
      },
      {
        label: "Example 3",
        text: "Hey! No worries at all, I’m here to help 🙂",
      },
    ],
  },
  {
    id: "warmth",
    question: "How warm and friendly should your AI Agent be?",
    options: [
      { label: "Very Warm" },
      { label: "Warm & Professional", recommended: true },
      { label: "Straightforward & Efficient" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I understand this matters to you. Let’s take it step by step and make sure you get the right help.",
      },
      {
        label: "Example 2",
        text: "Thanks for explaining that. I can help you with the next step.",
      },
      {
        label: "Example 3",
        text: "Received. Here is what we need from you to move forward.",
      },
    ],
  },
  {
    id: "empathy",
    question: "How empathetic should your AI Agent be when clients are stressed?",
    options: [
      { label: "Highly Empathetic" },
      { label: "Balanced Empathy", recommended: true },
      { label: "More Direct & Solution-focused" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I’m sorry you’re dealing with this. I’ll help you get this to the right person as quickly as possible.",
      },
      {
        label: "Example 2",
        text: "I understand. Let’s focus on what we can do next.",
      },
      {
        label: "Example 3",
        text: "The next step is to send us the details below so the team can review it.",
      },
    ],
  },
  {
    id: "directness",
    question: "Should your AI Agent chat a little or be very direct?",
    options: [
      { label: "Chatty & Engaging" },
      { label: "Balanced", recommended: true },
      { label: "Very Direct" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "That makes sense. A few details would help me guide you better. What happened, and when did it start?",
      },
      {
        label: "Example 2",
        text: "Thanks. Can you share a little more context so we can help properly?",
      },
      {
        label: "Example 3",
        text: "Please send the date, your name, and the main question.",
      },
    ],
  },
  {
    id: "appointmentStyle",
    question: "How should your AI Agent handle appointment requests?",
    options: [
      { label: "Gently suggest when appropriate", recommended: true },
      { label: "Only when client asks" },
      { label: "Always try to book" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I can share general information first. If you want personal advice after that, we can help schedule a time.",
      },
      {
        label: "Example 2",
        text: "Yes, I can help with an appointment. Which day works best for you?",
      },
      {
        label: "Example 3",
        text: "The best next step is to book a consultation. Would you like to schedule one now?",
      },
    ],
  },
  {
    id: "overallTone",
    question: "What overall tone should your AI Agent have?",
    options: [
      { label: "Calm & Patient", recommended: true },
      { label: "Energetic & Positive" },
      { label: "Authoritative & Confident" },
      { label: "Supportive & Helpful" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "No problem. Take your time. I’ll help you find the right next step.",
      },
      {
        label: "Example 2",
        text: "Great, we can help with that. Let’s get the important details first.",
      },
      {
        label: "Example 3",
        text: "Based on what you shared, this is the right way to proceed.",
      },
    ],
  },
  {
    id: "phrasesUse",
    question: "Are there any words or phrases your AI Agent should use often?",
    options: [
      { label: "Keep it simple and human", recommended: true },
      { label: "Use our business name often" },
      { label: "Use reassuring language" },
      { label: "No special phrases" },
    ],
    customLabel: "Or write the words and phrases you prefer",
    examples: [
      {
        label: "Example 1",
        text: "You can say: “I understand”, “Let’s look at this”, and “We can help with that.”",
      },
      {
        label: "Example 2",
        text: "Use the business name when confirming appointments or important details.",
      },
      {
        label: "Example 3",
        text: "Avoid sounding scripted. Use short, natural phrases.",
      },
    ],
  },
  {
    id: "phrasesAvoid",
    question: "Are there any words or phrases your AI Agent should never use?",
    options: [
      { label: "Avoid robotic phrases", recommended: true },
      { label: "Avoid slang" },
      { label: "Avoid over-promising" },
      { label: "No blocked phrases yet" },
    ],
    customLabel: "Or write the words and phrases to avoid",
    examples: [
      {
        label: "Example 1",
        text: "Avoid phrases like: “As a virtual assistant” or “I am unable to”.",
      },
      {
        label: "Example 2",
        text: "Avoid promising exact results, prices, or timelines unless they are confirmed.",
      },
      {
        label: "Example 3",
        text: "Avoid pushing for appointments in every message.",
      },
    ],
  },
  {
    id: "upsetClient",
    question: "How should your AI Agent reply when a client is upset or frustrated?",
    options: [
      { label: "Acknowledge feelings first", recommended: true },
      { label: "Apologize and move to next steps" },
      { label: "Stay calm and practical" },
      { label: "Escalate quickly to a human" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I understand this is frustrating. Let me help you get this to the right person.",
      },
      {
        label: "Example 2",
        text: "I’m sorry this has been difficult. Here is what we can do next.",
      },
      {
        label: "Example 3",
        text: "Thanks for explaining. I’ll pass this to the team so they can review it properly.",
      },
    ],
  },
  {
    id: "replyLength",
    question: "How long should your AI Agent’s replies usually be?",
    options: [
      { label: "Short & Clear" },
      { label: "Medium Length", recommended: true },
      { label: "Detailed & Thorough" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "Yes, we can help. Please send your name and preferred time.",
      },
      {
        label: "Example 2",
        text: "Yes, we can help with that. Please send your name, the best phone number, and the day that works for you.",
      },
      {
        label: "Example 3",
        text: "Yes, we can help with that. To prepare properly, please send your name, phone number, preferred day, and a short explanation of what you need help with.",
      },
    ],
  },
  {
    id: "questionsBack",
    question: "Should your AI Agent ask questions back to the client to understand better?",
    options: [
      { label: "Yes, when details are missing", recommended: true },
      { label: "Ask only one question at a time" },
      { label: "Ask several clear questions together" },
      { label: "Avoid questions unless necessary" },
    ],
    examples: [
      {
        label: "Example 1",
        text: "I can help. What day would work best for you?",
      },
      {
        label: "Example 2",
        text: "To understand this better, could you share when it happened?",
      },
      {
        label: "Example 3",
        text: "Please send your name, phone number, and the main thing you need help with.",
      },
    ],
  },
  {
    id: "overallDescription",
    question:
      "Describe in your own words how you want your AI Agent to sound overall",
    options: [
      { label: "Calm, helpful, and human", recommended: true },
      { label: "Professional, clear, and efficient" },
      { label: "Warm, patient, and reassuring" },
      { label: "Confident, direct, and practical" },
    ],
    customLabel: "Write your full description here",
    customRows: 7,
    examples: [
      {
        label: "Example 1",
        text: "Sound like a capable office assistant who answers first and only suggests appointments when useful.",
      },
      {
        label: "Example 2",
        text: "Sound professional but not cold. Be clear, patient, and helpful.",
      },
      {
        label: "Example 3",
        text: "Avoid sounding scripted. Keep replies natural, short, and useful.",
      },
    ],
  },
];

const EMPTY_ANSWER: Answer = { selected: "", custom: "" };

const EMPTY_SETTINGS: AgentPersonalitySettings = {
  tone: "",
  formality: "",
  empathy: "",
  appointmentStyle: "",
  instructions: "",
  examples: [],
};

function emptyAnswers(): Record<string, Answer> {
  return QUESTIONS.reduce<Record<string, Answer>>((acc, question) => {
    acc[question.id] = { ...EMPTY_ANSWER };
    return acc;
  }, {});
}

function friendlyError(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : "";
  if (/configuration|configured|not ready|missing/i.test(raw)) {
    return "The reply service is not ready yet. Please contact Unboks.";
  }
  return raw || fallback;
}

function answerText(answer?: Answer) {
  if (!answer) return "";
  return answer.custom.trim() || answer.selected.trim();
}

function findOption(question: WizardQuestion, value: string) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const exact = question.options.find((option) => {
    const optionText = option.label.replace(" (Recommended)", "").trim().toLowerCase();
    return optionText === normalized;
  });
  return exact?.label ?? "";
}

function buildAnswersFromSettings(
  settings: AgentPersonalitySettings | undefined,
) {
  const next = emptyAnswers();
  if (!settings) return next;

  const seed: Record<string, string> = {
    formality: settings.formality,
    warmth: settings.tone,
    empathy: settings.empathy,
    appointmentStyle: settings.appointmentStyle,
    overallDescription: settings.instructions,
  };

  QUESTIONS.forEach((question) => {
    const value = seed[question.id]?.trim();
    if (!value) return;
    const option = findOption(question, value);
    next[question.id] = option
      ? { selected: option, custom: "" }
      : { selected: "", custom: value };
  });

  return next;
}

function buildInstructions(answers: Record<string, Answer>) {
  const lines = [
    "Agent style guide",
    "",
    `Formality: ${answerText(answers.formality) || "Professional but Friendly"}`,
    `Warmth: ${answerText(answers.warmth) || "Warm & Professional"}`,
    `Empathy: ${answerText(answers.empathy) || "Balanced Empathy"}`,
    `Conversation style: ${answerText(answers.directness) || "Balanced"}`,
    `Appointment behavior: ${
      answerText(answers.appointmentStyle) || "Gently suggest when appropriate"
    }`,
    `Overall tone: ${answerText(answers.overallTone) || "Calm & Patient"}`,
    `Phrases to use often: ${answerText(answers.phrasesUse) || "Keep it simple and human"}`,
    `Phrases to avoid: ${answerText(answers.phrasesAvoid) || "Avoid robotic phrases"}`,
    `When a client is upset: ${
      answerText(answers.upsetClient) || "Acknowledge feelings first"
    }`,
    `Reply length: ${answerText(answers.replyLength) || "Medium Length"}`,
    `Questions back to clients: ${
      answerText(answers.questionsBack) || "Yes, when details are missing"
    }`,
    `Overall description: ${
      answerText(answers.overallDescription) ||
      "Calm, helpful, human, and useful."
    }`,
    "",
    "Important behavior",
    "- Answer the client question first when possible.",
    "- Do not push appointments in every message.",
    "- Sound like a capable office assistant, not a chatbot.",
    "- Keep the reply natural and useful.",
  ];
  return lines.join("\n");
}

function buildSettings(
  answers: Record<string, Answer>,
  examples: string[],
): AgentPersonalitySettings {
  return {
    tone: answerText(answers.overallTone) || answerText(answers.warmth),
    formality: answerText(answers.formality),
    empathy: answerText(answers.empathy),
    appointmentStyle: answerText(answers.appointmentStyle),
    instructions: buildInstructions(answers),
    examples,
  };
}

function defaultExamplesFromAnswers(answers: Record<string, Answer>) {
  return [
    `Thanks for reaching out. I understand what you’re asking. ${answerText(answers.questionsBack) || "Could you share a little more detail so we can help properly?"}`,
    `I can help with that. ${answerText(answers.appointmentStyle) || "I’ll answer what I can first, and if needed we can help schedule a time."}`,
    `I understand this may feel stressful. ${answerText(answers.upsetClient) || "Let’s focus on the next step and make sure the right person sees this."}`,
  ];
}

export function AgentPersonalityWizard() {
  const {
    settings,
    isLoading,
    loadError,
    generateExamples,
    isGenerating,
    save,
    isSaving,
  } = useAgentPersonality();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(emptyAnswers);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [customFeedbackOpen, setCustomFeedbackOpen] = useState(false);
  const [customFeedback, setCustomFeedback] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAnswers(buildAnswersFromSettings(settings));
  }, [settings]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(t);
  }, [saved]);

  const currentQuestion = QUESTIONS[step];
  const currentAnswer = answers[currentQuestion.id] ?? EMPTY_ANSWER;
  const isLastQuestion = step === QUESTIONS.length - 1;
  const inSimulation = step >= QUESTIONS.length;
  const progressValue = inSimulation
    ? 100
    : Math.round(((step + 1) / QUESTIONS.length) * 100);

  const canContinue = useMemo(() => {
    if (inSimulation) return true;
    return Boolean(answerText(currentAnswer));
  }, [currentAnswer, inSimulation]);

  const styleSettings = useMemo(() => {
    const examples = chat
      .filter((item) => item.role === "agent")
      .map((item) => item.text.trim())
      .filter(Boolean);
    return buildSettings(
      answers,
      examples.length ? examples : defaultExamplesFromAnswers(answers),
    );
  }, [answers, chat]);

  const updateAnswer = (questionId: string, patch: Partial<Answer>) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? EMPTY_ANSWER),
        ...patch,
      },
    }));
  };

  const appendChat = (role: ChatMessage["role"], text: string) => {
    setChat((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, role, text },
    ]);
  };

  const prepareAgentReply = async (clientMessage: string, feedback?: string) => {
    const request: AgentPersonalitySettings = {
      ...styleSettings,
      instructions: [
        styleSettings.instructions,
        "",
        "Test reply request",
        `Client message: ${clientMessage}`,
        feedback ? `Adjustment requested: ${feedback}` : "",
        "Write one natural reply in the chosen business style.",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const result = await generateExamples(request);
    return (
      result.examples[0]?.trim() ||
      "Thanks for explaining. I can help with that. Could you share one more detail so we can guide you properly?"
    );
  };

  const handleSendMessage = async (feedback?: string) => {
    const clientMessage =
      message.trim() ||
      chat
        .filter((item) => item.role === "client")
        .slice(-1)[0]
        ?.text.trim();
    if (!clientMessage) return;

    if (message.trim()) {
      appendChat("client", message.trim());
      setMessage("");
    }

    try {
      const reply = await prepareAgentReply(clientMessage, feedback);
      appendChat("agent", reply);
      setCustomFeedbackOpen(false);
      setCustomFeedback("");
    } catch (err) {
      toast.error(friendlyError(err, "Could not prepare a reply yet."));
    }
  };

  const handleFeedback = (feedback: string) => {
    if (feedback === "This is good") {
      toast.success("Good. You can keep testing or lock in this style.");
      return;
    }
    void handleSendMessage(feedback);
  };

  const handleSave = async () => {
    try {
      const result = await save(styleSettings);
      setAnswers(buildAnswersFromSettings(result));
      setSaved(true);
      if (result.bridgeSaved === false) {
        toast.warning("Saved. The live update did not confirm yet.");
      } else {
        toast.success("Style saved and activated.");
      }
    } catch (err) {
      toast.error(friendlyError(err, "Could not save this style."));
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[#e8eaed] bg-white px-5 py-5 text-[14px] text-[#5f6368]">
        Loading your AI Agent style...
      </section>
    );
  }

  if (!started) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="mx-auto flex min-h-[520px] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f0fe] text-[#1a73e8]">
            <Sparkles className="h-7 w-7" />
          </span>
          <h3 className="text-[28px] font-semibold tracking-normal text-[#202124]">
            Let’s personalize your AI Agent
          </h3>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#5f6368]">
            This will help your AI Agent reply to your clients in a way that
            matches your business style. It’s an important step and will take
            about 5–7 minutes.
          </p>
          {loadError && (
            <div className="mt-6 rounded-xl border border-[#f6caca] bg-[#fce8e6] px-4 py-3 text-left text-[13px] text-[#a50e0e]">
              Could not load the current style. You can still continue.
            </div>
          )}
          <Button
            type="button"
            size="lg"
            className="mt-8 min-w-[220px] rounded-xl bg-[#1a73e8] text-white"
            onClick={() => setStarted(true)}
          >
            Start Personalizing
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
      <header className="border-b border-[#e8eaed] bg-[#fbfbfd] px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
              {inSimulation
                ? "Test your AI Agent"
                : `Step ${step + 1} of ${QUESTIONS.length}`}
            </p>
            <span className="rounded-full border border-[#dadce0] bg-white px-3 py-1 text-[12px] font-medium text-[#5f6368]">
              {inSimulation ? "Ready to save" : `${progressValue}% complete`}
            </span>
          </div>
          <Progress value={progressValue} className="h-2 bg-[#e8eaed]" />
        </div>
      </header>

      {inSimulation ? (
        <div className="mx-auto max-w-4xl px-5 py-7 sm:px-7">
          <div className="mb-6">
            <h3 className="text-[25px] font-semibold tracking-normal text-[#202124]">
              Test your AI Agent before saving
            </h3>
            <p className="mt-2 text-[14px] leading-6 text-[#5f6368]">
              Type a sample message as if a client sent it. See how your AI
              Agent would reply.
            </p>
          </div>

          <div className="rounded-2xl border border-[#e8eaed] bg-[#f8fafd] p-4 sm:p-5">
            <div className="min-h-[280px] space-y-4">
              {chat.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-[#dadce0] bg-white px-5 text-center">
                  <MessageCircle className="mb-3 h-7 w-7 text-[#9aa0a6]" />
                  <p className="text-[14px] font-medium text-[#3c4043]">
                    Send a sample client message to test the style.
                  </p>
                </div>
              ) : (
                chat.map((item, index) => {
                  const isAgent = item.role === "agent";
                  const isLastAgent =
                    isAgent &&
                    index ===
                      chat
                        .map((messageItem, messageIndex) =>
                          messageItem.role === "agent" ? messageIndex : -1,
                        )
                        .filter((messageIndex) => messageIndex >= 0)
                        .slice(-1)[0];
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex",
                        isAgent ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className="max-w-[78%]">
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-[14px] leading-6 shadow-sm",
                            isAgent
                              ? "bg-[#1a73e8] text-white"
                              : "border border-[#e8eaed] bg-white text-[#202124]",
                          )}
                        >
                          {item.text}
                        </div>
                        {isLastAgent && (
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            {[
                              "This is good",
                              "Make it warmer",
                              "Make it more professional",
                              "Make it shorter",
                            ].map((label) => (
                              <Button
                                key={label}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isGenerating || isSaving}
                                onClick={() => handleFeedback(label)}
                                className="rounded-full bg-white text-[12px]"
                              >
                                {label}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isGenerating || isSaving}
                              onClick={() => setCustomFeedbackOpen((v) => !v)}
                              className="rounded-full bg-white text-[12px]"
                            >
                              Custom instruction
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {customFeedbackOpen && (
              <div className="mt-4 rounded-xl border border-[#dadce0] bg-white p-3">
                <label className="mb-2 block text-[13px] font-medium text-[#3c4043]">
                  Custom instruction
                </label>
                <Textarea
                  value={customFeedback}
                  onChange={(event) => setCustomFeedback(event.target.value)}
                  rows={3}
                  className="resize-y bg-white text-[14px]"
                  placeholder="Example: Make this reply more relaxed and less sales-focused."
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    disabled={!customFeedback.trim() || isGenerating}
                    onClick={() => handleSendMessage(customFeedback.trim())}
                    className="rounded-lg bg-[#1a73e8] text-white"
                  >
                    Apply instruction
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                className="resize-y bg-white text-[14px]"
                placeholder="Type a sample client message..."
              />
              <Button
                type="button"
                disabled={!message.trim() || isGenerating || isSaving}
                onClick={() => handleSendMessage()}
                className="h-auto min-w-[120px] rounded-xl bg-[#1a73e8] text-white"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(QUESTIONS.length - 1)}
              disabled={isGenerating || isSaving}
              className="rounded-xl bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "text-[13px] text-[#137333] transition-opacity",
                  saved ? "opacity-100" : "opacity-0",
                )}
              >
                Saved
              </span>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isGenerating}
                className="rounded-xl bg-[#1a73e8] px-5 text-white"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Yes, this is perfect – Lock in this style for my AI Agent
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-5 py-7 sm:px-7">
          <div className="mb-6">
            <h3 className="text-[25px] font-semibold tracking-normal text-[#202124]">
              {currentQuestion.question}
            </h3>
          </div>

          <div className="grid gap-3">
            {currentQuestion.options.map((option) => {
              const selected = currentAnswer.selected === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() =>
                    updateAnswer(currentQuestion.id, {
                      selected: option.label,
                      custom: "",
                    })
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors",
                    selected
                      ? "border-[#1a73e8] bg-[#e8f0fe]"
                      : "border-[#e8eaed] bg-white hover:bg-[#f8f9fa]",
                  )}
                >
                  <span className="text-[15px] font-medium text-[#202124]">
                    {option.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {option.recommended && (
                      <span className="rounded-full bg-[#e6f4ea] px-2.5 py-1 text-[11px] font-semibold text-[#137333]">
                        Recommended
                      </span>
                    )}
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-full border",
                        selected
                          ? "border-[#1a73e8] bg-[#1a73e8] text-white"
                          : "border-[#dadce0] bg-white text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-[13px] font-medium text-[#3c4043]">
              {currentQuestion.customLabel ?? "Or write your own answer"}
            </span>
            <Textarea
              value={currentAnswer.custom}
              onChange={(event) =>
                updateAnswer(currentQuestion.id, {
                  selected: "",
                  custom: event.target.value,
                })
              }
              rows={currentQuestion.customRows ?? 4}
              className="resize-y bg-white text-[14px]"
              placeholder="Write your own answer..."
            />
          </label>

          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
              Real-world reply examples
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              {currentQuestion.examples.map((example) => (
                <div
                  key={example.label}
                  className="rounded-2xl border border-[#e8eaed] bg-[#fbfbfd] p-4"
                >
                  <p className="mb-2 text-[12px] font-semibold text-[#1a73e8]">
                    {example.label}
                  </p>
                  <p className="text-[13px] leading-6 text-[#3c4043]">
                    {example.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eaed] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === 0) {
                  setStarted(false);
                } else {
                  setStep((current) => current - 1);
                }
              }}
              className="rounded-xl bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
              className="rounded-xl bg-[#1a73e8] px-5 text-white"
            >
              {isLastQuestion ? "Test your AI Agent" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
