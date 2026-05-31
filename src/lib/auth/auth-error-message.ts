const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Please confirm your email before signing in.",
  user_already_exists: "An account with this email already exists.",
  over_email_send_rate_limit: "Too many emails sent. Please wait before trying again.",
  too_many_requests: "Too many requests. Please try again later.",
  weak_password: "Password does not meet the security requirements.",
  email_address_not_authorized: "This email address is not authorized.",
};

export function authErrorMessage(code: string | undefined): string {
  return (code && AUTH_ERROR_MESSAGES[code]) ?? "Something went wrong. Please try again.";
}
