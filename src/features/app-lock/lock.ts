/**
 * 앱 잠금 (PROD.MD §1-6, P2) — 기기마다 Face ID·지문·기기 암호(WebAuthn 플랫폼 인증기)로 화면을 연다.
 *
 * 무엇을 막나: 잠금 풀린 휴대폰을 남이 잠깐 집었을 때 가계부가 그대로 보이는 것.
 * 서버 검증 없는 화면 가리개다 — 로그인 세션은 그대로이고, 기기 브라우저 저장소에 "이 사람은 이 기기에서 잠금을 쓴다"만 둔다.
 * 그래서 다른 사람이 같은 기기에서 로그인하면 그 사람에게는 걸리지 않는다.
 * 잠금 화면에서 풀 수 없으면 [로그아웃] — 이 기기 잠금을 끄고 로그아웃한다 (비밀번호로 다시 로그인하는 것이 본인 확인).
 */

export const APP_LOCK_STORAGE_KEY = "finlog:app-lock";
/** 다른 앱에 이만큼 넘게 있다 돌아오면 다시 잠근다 */
export const LOCK_AFTER_MS = 60_000;

export interface AppLockConfig {
  userId: string;
  /** WebAuthn 자격 증명 id (base64url) */
  credentialId: string;
}

/** 첫 화면을 그리기 전에 — 잠금을 쓰는 기기면 내용부터 가린다 (누구 잠금인지는 앱이 뜬 뒤 확인) */
export const APP_LOCK_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(APP_LOCK_STORAGE_KEY)}))document.documentElement.setAttribute("data-locked","")}catch(e){}`;

export function readLockConfig(): AppLockConfig | null {
  try {
    const raw = localStorage.getItem(APP_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AppLockConfig>;
    return typeof v.userId === "string" && typeof v.credentialId === "string" ? { userId: v.userId, credentialId: v.credentialId } : null;
  } catch {
    return null;
  }
}

export function writeLockConfig(config: AppLockConfig | null) {
  try {
    if (config) localStorage.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(APP_LOCK_STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경 — 잠금을 켤 수 없다 (켜기 버튼에서 확인)
  }
}

/** 화면 가리개 켜고 끄기 (globals.css: html[data-locked] [data-slot="app-shell"]) */
export function setCovered(covered: boolean) {
  if (covered) document.documentElement.setAttribute("data-locked", "");
  else document.documentElement.removeAttribute("data-locked");
}

const toB64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32));

/** 이 기기에 지문·얼굴·기기 암호로 확인하는 인증기가 있는지 */
export async function isLockSupported(): Promise<boolean> {
  try {
    return typeof window !== "undefined" && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** 잠금 켜기 — 기기에 FINLOG 앱 잠금용 자격 증명을 만든다 (버튼을 눌러서 불러야 한다) */
export async function createLockCredential(userId: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "FINLOG", id: location.hostname },
      user: { id: new TextEncoder().encode(userId), name: "FINLOG 앱 잠금", displayName: "FINLOG 앱 잠금" },
      challenge: randomChallenge(),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("no credential");
  return toB64url(cred.rawId);
}

/** 잠금 풀기 — 기기가 지문·얼굴·암호를 확인해야 성공한다 */
export async function verifyLock(credentialId: string): Promise<boolean> {
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: fromB64url(credentialId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!cred;
  } catch {
    return false;
  }
}
