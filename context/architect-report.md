# Raport architektoniczny

**Źródła wejść**

- L2 Mapa repozytorium — semantic-kernel — `context/map/repo-map.md`
- L3 Research ficzera — semantic-kernel — `context/changes/mevd-filter-translation/research.md`
- L4 Plan refaktoryzacji — semantic-kernel — `context/changes/refactor-opportunities/plan.md`
- L5 Notatki DDD — meal-draft — `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md`

## 1. Opisane projekty

**semantic-kernel** — SDK AI do budowania agentów LLM; .NET (główny) + Python; monorepo ~60 providerów wektorowych i konektorów modelowych; artefakty: mapa repozytorium (L2), research ficzera filtrów (L3), plan refaktoryzacji (L4).

**meal-draft** — responsywna aplikacja webowa SSR: Astro 6 + React 19 islands + Tailwind 4 + Supabase (auth + Postgres + RLS) + Cloudflare Workers; ~10 plików logiki biznesowej, 3 tabele domenowe; artefakt: notatki domenowe DDD (L5). Core meal-draft wdrożony (S-01–S-05).

## 2. Mapa projektu (L2 — semantic-kernel)

**Kluczowe wnioski z mapy repozytorium:**

1. **Strefy ryzyka (P0):** hub abstrakcji + providerzy; compile-linki SQL poza grafem MSBuild; testy integracyjne niestabilne przez rotację wersji pakietów.
2. **Lokalne centra:** builder modelu, rdzeń SK, testy zgodności (conformance).
3. **Entry point:** translator filtrów → builder → provider → testy.
4. **Unknowns:** Python (odrębny subprojekt, poza mapą), pełny fan-out providerów nieznany bez przejścia całego grafu.

## 3. Analiza ficzera (L3 — semantic-kernel)

**Wybrany przepływ:** Filtrowanie zapytań wektorowych (`VectorSearchFilter`) — najcieńszy kanał przez **strefę P0: hub abstrakcji + providerzy** (`repo-map.md:64,160`). Zmiana kontraktu w jednym miejscu uderza w 8–11 providerów, co czyni go najwyższym priorytetem analizy.

**Feature overview:** Input wchodzi jako drzewo wyrażeń LINQ z warstwy wywołującej. Hub deleguje do translatora specyficznego dla providera (SQL, OData, BSON), który mapuje węzły drzewa na natywny ciąg filtra lub operatory zapytania — brak mutacji stanu, operacja czysto transformacyjna. Wynik trafia bezpośrednio do zapytania wektorowego providera. SQL dociera dodatkowo przez compile-link poza grafem MSBuild, niewidoczny w standardowym drzewie zależności.

**Technical debt (top 3, blast-radius potwierdzony ast-grepem):**

- **Promień kontraktu**: 1 poprawka → 8–11 providerów
- **Luka testowa**: Brak unit testów bazy
- **Compile-linki**: SQL niewidoczny w grafie

## 4. Plan refaktoryzacji (L4 — semantic-kernel)

**Co refaktoryzowane (wybrana opcja):** compile-linki ujawnione jako jawne węzły w grafie MSBuild + siatka 5–8 smoke testów na głównej ścieżce (PgVector, SQL). **Czego świadomie NIE robimy:** BSON, fabryka, legacy, pełne pokrycie per-translator.

**Fazy planu (jedna linia + weryfikacja):** **1. Smoke testy**: `dotnet test`, regresja PgVector (auto) **2. Deptree compile-link**: Węzeł SQL widoczny; zero diff builda (auto)

## 5. Domena wg DDD (L5 — meal-draft)

### Ubiquitous language

**Strict Pantry** — składniki przepisu wyłącznie z spiżarni użytkownika, zero tolerancji. **Sesja generowania** — zakres klienta, w którym „Inny przepis" wyklucza wcześniejsze nazwy. **no_match** — wynik biznesowy (HTTP 200, nie błąd). **Podstawy kuchenne** — dozwolone wyjątki od Strict Pantry (np. sól, olej, mąka) bez wpisu w spiżarni.

**Najważniejsze rozjazdy model ↔ kod:** podstawy kuchenne obecne w kodzie, ale poza PRD (niezadeklarowane); limit czasu przygotowania egzekwowany wyłącznie w prompcie — model może zwrócić przepis na 45 min przy limicie 15 i dostanie HTTP 200; wykluczenia nazw w sesji generowania istnieją tylko po stronie klienta, nie są walidowane serwerowo.

### Niezmiennik #1 i agregat

**INV-TIME-001** należy do agregatu `ConstrainedMealProposal` — jedyny guardrail bez egzekucji serwerowej. Świadoma luka: model może naruszyć limit czasu niewidocznie dla systemu. Oznaczone do adresowania przy pierwszym iterze jakości generowania.

### Anti-Corruption Layer

Przeciek **AI SDK + OpenRouter** przez **3 warstwy**: API route → monolit `generation.ts` (domena + Supabase + SDK w jednym pliku) → testy integracyjne (mock modułów, nie portu domenowego). `generation.ts:2` importuje bezpośrednio z `"ai"` — brak portu domenowego. Planowany ACL (`03-anti-corruption-layer.md`, `type: refactor-plan`) **nie wdrożony**.

## 6. Decyzje, które należą do mnie

Propozycja agenta zakładała zbadanie całego huba abstrakcji — zawęziłam to do filtrów LINQ, bo legacy i BSON mają odrębną logikę analizy i wciągnęłyby projekt w inny problem niż ten, który chciałam zrozumieć. Przy planie refaktoryzacji odrzuciłam wariant C1 (Common.csproj): uzyskuje ten sam wgląd w compile-linki co autodetekcja deptree, ale wymaga dotknięcia struktury builda — koszt nieproporcjonalny do zysku.

Dwie decyzje po stronie meal-draft były trudniejsze do uzasadnienia. Agent wskazał INV-PANTRY-001 jako priorytet; wybrałam INV-TIME-001, bo czas przygotowania to jedyny niezmiennik bez żadnego guardrail serwerowego — naruszenie jest niewidoczne dla systemu, nie tylko dla użytkownika. Zakres ACL ograniczyłam do AI SDK, pomijając Supabase: wymiana modelu LLM to realna perspektywa, wymiana bazy danych — nie na tym etapie stosu.
