export const AUTH_FORM_INVALID_REQUEST = "Nieprawidłowe żądanie.";
export const AUTH_FORM_INVALID_INPUT = "Nieprawidłowe dane.";
export const AUTH_SERVICE_UNAVAILABLE = "Usługa logowania jest tymczasowo niedostępna. Spróbuj ponownie później.";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy adres e-mail lub hasło.",
  email_not_confirmed: "Konto nie jest jeszcze aktywne. Skontaktuj się z administratorem.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje.",
  email_exists: "Konto z tym adresem e-mail już istnieje.",
  over_email_send_rate_limit: "Wysłano zbyt wiele wiadomości. Spróbuj ponownie później.",
  too_many_requests: "Zbyt wiele żądań. Spróbuj ponownie później.",
  weak_password: "Hasło nie spełnia wymagań bezpieczeństwa.",
  email_address_not_authorized: "Ten adres e-mail nie jest autoryzowany.",
};

export function authErrorMessage(code: string | undefined): string {
  return (code && AUTH_ERROR_MESSAGES[code]) ?? "Coś poszło nie tak. Spróbuj ponownie.";
}
