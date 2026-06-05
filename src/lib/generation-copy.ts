/** Polish user-facing strings for meal generation (client wire + UI). */

export const GENERATION_VALIDATION_MESSAGE = "Nieprawidłowe dane żądania. Spróbuj ponownie.";

export const GENERATION_RATE_LIMIT_MESSAGE = "Osiągnięto limit generowania. Spróbuj ponownie za godzinę.";

export const GENERATION_UNAUTHORIZED_MESSAGE = "Sesja wygasła. Zaloguj się ponownie.";

export const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować przepisu. Spróbuj ponownie później.";

export const GENERATION_UNAVAILABLE_MESSAGE = "Usługa jest tymczasowo niedostępna. Spróbuj ponownie później.";

export const GENERATION_NETWORK_MESSAGE = "Błąd połączenia. Sprawdź sieć i spróbuj ponownie.";

export const GENERATION_UNKNOWN_MESSAGE = "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.";

export const TRY_ANOTHER_LABEL = "Spróbuj inny";

export const TRY_ANOTHER_LOADING = "Szukam innego…";

export const rejectedCountLabel = (count: number) => `Odrzucono: ${count}`;

export const EXHAUSTION_TITLE = "Wykorzystano propozycje w tej sesji";

export const EXHAUSTION_BODY = "Nie znaleźliśmy kolejnego przepisu spełniającego Twoje kryteria w tej sesji.";

export const EXHAUSTION_HINTS_HEADING = "Co możesz zrobić?";

export const EXHAUSTION_HINT_MEAL_TYPE = "Zmień typ posiłku";

export const EXHAUSTION_HINT_TIME = "Wydłuż czas przygotowania";

export const EXCLUSION_CAP_MESSAGE = "Osiągnięto limit odrzuceń w tej sesji. Naciśnij Generuj, aby zacząć od nowa.";
