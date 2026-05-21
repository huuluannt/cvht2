import { useEffect, useMemo, useState } from "react";
import { AdminPanel } from "./components/AdminPanel";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ChatWindow } from "./components/ChatWindow";
import { GuideModal } from "./components/GuideModal";
import { getAuthState, logoutAdmin } from "./lib/api";
import type { AuthState, Provider } from "./lib/types";

const API_KEY_STORAGE_KEY = "cvht2_api_key";
const PROVIDER_STORAGE_KEY = "cvht2_provider";

function readStoredProvider(): Provider {
  return localStorage.getItem(PROVIDER_STORAGE_KEY) === "groq" ? "groq" : "gemini";
}

function authMessageFromUrl(): string {
  const reason = new URLSearchParams(window.location.search).get("auth");

  if (reason === "admin_not_allowed") {
    return "Email Google này không nằm trong ADMIN_EMAILS.";
  }

  if (reason === "invalid_oauth_state") {
    return "Phiên đăng nhập Google không hợp lệ. Vui lòng thử lại.";
  }

  if (reason === "google_oauth_failed") {
    return "Đăng nhập Google thất bại. Kiểm tra cấu hình OAuth.";
  }

  if (reason === "oauth_not_configured") {
    return "Google OAuth chưa được cấu hình đủ. Kiểm tra GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI và SESSION_SECRET trên Vercel.";
  }

  return "";
}

function App() {
  const [auth, setAuth] = useState<AuthState>({ email: null, isAdmin: false });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || "");
  const [provider, setProvider] = useState<Provider>(readStoredProvider);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState(authMessageFromUrl);

  const hasApiKey = useMemo(() => apiKey.trim().length > 0, [apiKey]);

  useEffect(() => {
    getAuthState()
      .then(setAuth)
      .catch(() => setAuth({ email: null, isAdmin: false }));
  }, []);

  function saveApiKey(nextKey: string) {
    setApiKey(nextKey);

    if (nextKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, nextKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  }

  function changeProvider(nextProvider: Provider) {
    setProvider(nextProvider);
    localStorage.setItem(PROVIDER_STORAGE_KEY, nextProvider);
  }

  async function handleLogout() {
    await logoutAdmin();
    setAuth({ email: null, isAdmin: false });
  }

  const chat = (
    <ChatWindow
      apiKey={apiKey}
      isAdmin={auth.isAdmin}
      provider={provider}
      onOpenGuide={() => setIsGuideOpen(true)}
      onOpenKeyModal={() => setIsKeyModalOpen(true)}
      onProviderChange={changeProvider}
    />
  );

  return (
    <>
      {auth.isAdmin ? (
        <main className="admin-layout">
          <AdminPanel email={auth.email} onLogout={handleLogout} />
          <section className="admin-chat-pane">{chat}</section>
        </main>
      ) : (
        <main className="user-layout">
          <header className="topbar">
            <div className="brand">
              <span className="brand-mark">CV</span>
              <div>
                <strong>CVHT2</strong>
                <span>Academic advisor chatbot</span>
              </div>
            </div>
            <a className="admin-link" href="/api/auth/google/start">
              Admin login
            </a>
          </header>

          {authNotice && (
            <button
              className="auth-notice"
              type="button"
              onClick={() => {
                setAuthNotice("");
                window.history.replaceState(null, "", "/");
              }}
            >
              {authNotice}
            </button>
          )}

          <section className="user-chat-wrap">
            {!hasApiKey && (
              <div className="key-reminder">
                Thêm API key Gemini hoặc Groq để bắt đầu chat. Key chỉ lưu trong trình duyệt.
              </div>
            )}
            {chat}
          </section>
        </main>
      )}

      <ApiKeyModal
        apiKey={apiKey}
        open={isKeyModalOpen}
        provider={provider}
        onClose={() => setIsKeyModalOpen(false)}
        onDelete={() => saveApiKey("")}
        onProviderChange={changeProvider}
        onSave={saveApiKey}
      />
      <GuideModal open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
}

export default App;
