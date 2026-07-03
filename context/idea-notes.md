## MealDraft - MVP

### Główny problem

Marnowanie czasu i żywności spowodowane brakiem szybkiego pomysłu na posiłek („co ugotować na teraz”), który byłby precyzyjnie dopasowany do aktualnej zawartości lodówki, posiadanego sprzętu oraz ograniczeń czasowych użytkownika.

### Najmniejszy zestaw funkcjonalności

- Zarządzanie wirtualną spiżarnią: Prosty system CRUD do kontrolowania produktów dostępnych w domu (nazwa produktu).
- Konfigurator ograniczeń (Constraints): Możliwość określenia czasu (np. 15/30/45 min), typu posiłku (śniadanie/obiad/kolacja) oraz zaznaczenia posiadanego sprzętu (patelnia, piekarnik, garnek, blender).
- Wybór strategii decyzji: Tryb restrykcyjny (Strict Pantry – gotuj tylko z tego, co masz) lub elastyczny (Minimum Missing – dopuść posiłek z maksymalnie 1–3 brakującymi składnikami).
- Generowanie propozycji przez AI: Silnik decyzyjny zwracający dokładnie jedną, konkretną propozycję posiłku (nazwa dania, czas przygotowania, wymagany sprzęt, lista składników w podziale na użyte z domu/brakujące do dokupienia, kroki przygotowania).
- Zapis i Historia: Możliwość dodania propozycji do ulubionych oraz podgląd historii ostatnich wygenerowanych potraw.
- System kont użytkowników: Autoryzacja zapewniająca prywatność i izolację danych spiżarni oraz historii.

### Co NIE wchodzi w zakres MVP

- Planowanie tygodniowych jadłospisów i diet długoterminowych.
- Liczenie kalorii oraz makroskładników (unikanie modułu dietetycznego).
- Integracja ze sklepami i automatyczne generowanie zbiorczych list zakupowych.
- Zaawansowana automatyzacja magazynowa (np. inteligentne, automatyczne odejmowanie precyzyjnej gramatury składników z bazy danych po ugotowaniu).
- Dedykowana aplikacja mobilna (na start wyłącznie responsywna aplikacja webowa).

### Kryteria sukcesu

- 100% wygenerowanych propozycji w trybie Strict Pantry bezwzględnie nie zawiera składników spoza zadeklarowanej spiżarni użytkownika.
- Wygenerowany posiłek w 100% przypadków respektuje twarde filtry techniczne (zaznaczony sprzęt kuchenny oraz zdefiniowany time-box).
- Aplikacja bezbłędnie przechodzi automatyczny test E2E: logowanie - dodanie produktów do spiżarni - wygenerowanie posiłku - asercja poprawności filtrów i braku składników spoza spiżarni w trybie Strict Pantry.
