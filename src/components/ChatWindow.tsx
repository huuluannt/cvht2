import { Bot, HelpCircle, KeyRound, Loader2, PanelLeftOpen, Send, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { askCvht } from "../lib/api";
import type { ChatMessage, Provider } from "../lib/types";

const INITIAL_MESSAGE = "Xin chào, tôi là chatbot CVHT. Bạn có thắc mắc gì không?";
const MAX_QUESTION_LENGTH = 1200;

type ChatWindowProps = {
  apiKey: string;
  isAdmin: boolean;
  onOpenAdminPanel?: () => void;
  provider: Provider;
  onOpenGuide: () => void;
  onOpenKeyModal: () => void;
  onProviderChange: (provider: Provider) => void;
};

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

export function ChatWindow({
  apiKey,
  isAdmin,
  onOpenAdminPanel,
  provider,
  onOpenGuide,
  onOpenKeyModal,
  onProviderChange,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("assistant", INITIAL_MESSAGE),
  ]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isSending) {
      return;
    }

    if (!isAdmin && !apiKey) {
      setError("Bạn cần thêm API key trước khi chat.");
      onOpenKeyModal();
      return;
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      setError(`Câu hỏi quá dài. Giới hạn là ${MAX_QUESTION_LENGTH} ký tự.`);
      return;
    }

    setError("");
    setQuestion("");
    setMessages((current) => [...current, createMessage("user", trimmedQuestion)]);
    setIsSending(true);

    try {
      const answer = await askCvht(provider, trimmedQuestion, {
        apiKey,
        isAdmin,
      });
      setMessages((current) => [...current, createMessage("assistant", answer)]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Không thể gửi câu hỏi. Vui lòng thử lại.";
      setError(message);
      setMessages((current) => [...current, createMessage("assistant", message)]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="chat-shell" aria-label="CVHT Chatbot">
      <header className="chat-header">
        <div className="chat-identity">
          <span className="bot-mark" aria-hidden="true">
            <Bot size={20} />
          </span>
          <div>
            <h1>CVHT Chatbot</h1>
            <p>Khoa Sinh học - CNSH, Trường ĐH KHTN, ĐHQG-HCM</p>
          </div>
        </div>

        <div className="chat-tools">
          {isAdmin && onOpenAdminPanel && (
            <button
              aria-label="Mở admin"
              className="icon-button mobile-admin-button"
              title="Mở admin"
              type="button"
              onClick={onOpenAdminPanel}
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <label className="provider-select">
            <span>Provider</span>
            <select value={provider} onChange={(event) => onProviderChange(event.target.value as Provider)}>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </label>
          {isAdmin ? (
            <span className="server-key-pill">
              <ShieldCheck size={16} />
              Server key
            </span>
          ) : (
            <>
              <button className="secondary-button" type="button" onClick={onOpenKeyModal}>
                <KeyRound size={16} />
                Add API Key
              </button>
              <button className="ghost-button" type="button" onClick={onOpenGuide}>
                <HelpCircle size={16} />
                How to get API key?
              </button>
            </>
          )}
        </div>
      </header>

      <div className="message-list" ref={scrollRef}>
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <div className="message-bubble">{message.content}</div>
          </article>
        ))}
        {isSending && (
          <article className="message assistant">
            <div className="message-bubble loading-bubble">
              <Loader2 className="spin-icon" size={16} />
              Đang tra cứu tài liệu CVHT...
            </div>
          </article>
        )}
      </div>

      {error && <div className="inline-error">{error}</div>}

      <form className="composer" onSubmit={submitQuestion}>
        <textarea
          aria-label="Nhập câu hỏi"
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Nhập câu hỏi về học vụ..."
          rows={1}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button aria-label="Gửi câu hỏi" className="send-button" disabled={isSending} type="submit">
          {isSending ? <Loader2 className="spin-icon" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </section>
  );
}
