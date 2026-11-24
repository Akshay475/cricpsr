export const ACCESS_TOKEN_KEY = "cricpsr_access_token";

type LoginResponse = {
  data?: {
    accessToken?: unknown;
  };
  error?: { message?: unknown };
};

type LoginOptions = {
  apiUrl: string;
  fetcher?: typeof fetch;
  storage: Pick<Storage, "setItem">;
  navigate: (path: "/dashboard") => void;
};

export async function loginAndNavigate(
  identifier: string,
  password: string,
  { apiUrl, fetcher = fetch, storage, navigate }: LoginOptions
): Promise<void> {
  const response = await fetcher(`${apiUrl.replace(/\/+$/, "")}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });

  let payload: LoginResponse;
  try {
    payload = await response.json() as LoginResponse;
  } catch {
    throw new Error("Unable to read the login response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(typeof payload.error?.message === "string" ? payload.error.message : "Unable to login");
  }
  if (typeof payload.data?.accessToken !== "string") {
    throw new Error("The login response was incomplete. Please try again.");
  }

  storage.setItem(ACCESS_TOKEN_KEY, payload.data.accessToken);
  navigate("/dashboard");
}
