# Raport architektoniczny

**Źródła wejść**

- Mapa repozytorium (L2), semantic-kernel, `context/map/repo-map.md`
- Research wybranego ficzera (L3), semantic-kernel, `context/changes/mevd-filter-translation/research.md`
- Plan refaktoryzacji (L4), semantic-kernel, `context/changes/refactor-opportunities/plan.md`
- Notatki o domenie / DDD (L5), meal-draft, `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md`

## 1. Opisane projekty

**semantic-kernel** — SDK AI do budowania agentów LLM; .NET (główny) + Python; monorepo ~60 providerów wektorowych i konektorów modelowych; artefakty: mapa repozytorium (L2), research ficzera filtrów (L3), plan refaktoryzacji (L4).

**meal-draft** — responsywna aplikacja webowa SSR: Astro 6 + React 19 islands + Tailwind 4 + Supabase (auth + Postgres + RLS) + Cloudflare Workers; ~10 plików logiki biznesowej, 3 tabele domenowe; artefakt: notatki domenowe DDD (L5). Core meal-draft wdrożony (S-01–S-05).

## 2. Mapa projektu (L2 — semantic-kernel)

**Kluczowe wnioski z mapy repozytorium:**

1. **Strefy ryzyka (P0: top ryzyko):** hub abstrakcji + providerzy; testy integracyjne (częste zmiany wersji pakietów powodują regresje).
2. **Lokalne centra:** builder modelu, rdzeń SK, testy zgodności (conformance).
3. **Punkt wejścia do nieznanego repo:** translator filtrów → builder → provider → testy.
4. **Ukryte sprzężenia:** współdzielone pliki między projektami poza grafem MSBuild; legacy omija hub.
5. **Unknowns:** Python, fan-out integracji.

Analiza skoncentrowana w hubie abstrakcji — nie u wszystkich providerów jednocześnie.

## 3. Analiza ficzera (L3 — semantic-kernel)

**Wybrany przepływ:** `VectorSearchFilter` (drzewo wyrażeń LINQ) → hub abstrakcji → translator providera → predykat natywny — najcieńszy kanał przez **strefę P0: hub abstrakcji + providerzy** (`repo-map.md:64,160`).

**Feature overview:** Zapytanie wchodzi jako sparametryzowane drzewo wyrażeń LINQ (`VectorSearchFilter`). Hub deleguje do translatora specyficznego dla providera (SQL, OData, BSON), który mapuje węzły na natywny ciąg filtra lub operatory zapytania. Operacja jest czysto transformacyjna — brak mutacji stanu; wynik trafia bezpośrednio do zapytania wektorowego providera. SQL wstrzykiwany przez compile-link poza grafem MSBuild (niewidoczny w standardowym drzewie zależności).

**Technical debt (top 3, blast-radius potwierdzony ast-grepem):**

- **Promień kontraktu**: 1 poprawka → 8–11 providerów
- **Luka testowa**: Brak unit testów bazy
- **Compile-linki**: SQL niewidoczny w grafie

## 4. Plan refaktoryzacji (L4 — semantic-kernel)

**Co refaktoryzowane (wybrana opcja):** compile-linki ujawnione jako jawne węzły w grafie MSBuild + siatka 5–8 smoke testów na głównej ścieżce (PgVector, SQL). **Czego świadomie NIE robimy:** BSON, fabryka, legacy, pełne pokrycie per-translator.

**Fazy planu (jedna linia + weryfikacja):**

**1. Smoke testy**: `dotnet test`, regresja PgVector (auto)
**2. Deptree compile-link**: Węzeł SQL widoczny; zero diff builda (auto)

## 5. Domena wg DDD (L5 — meal-draft)

### Ubiquitous language

**Strict Pantry** — składniki przepisu wyłącznie z spiżarni użytkownika, zero tolerancji. **Sesja generowania** — zakres klienta, w którym „Inny przepis" wyklucza wcześniejsze nazwy. **no_match** — wynik biznesowy (HTTP 200, nie błąd). **Podstawy kuchenne** — dozwolone wyjątki od Strict Pantry (np. sól, olej, mąka) bez wpisu w spiżarni.

**Najważniejsze rozjazdy model ↔ kod:** podstawy kuchenne vs PRD; czas tylko w prompcie (HTTP 200 mimo 45 min przy limicie 15); wykluczenia sesji bez walidacji serwerowej.

### Niezmiennik #1 i agregat

**INV-TIME-001** należy do agregatu `ConstrainedMealProposal` — jedyny guardrail bez egzekucji serwerowej.

### Anti-Corruption Layer

Przeciek **AI SDK + OpenRouter** (`ai`, `@openrouter/ai-sdk-provider`) skoncentrowany w jednym pliku `generation.ts`, ale logicznie przez **3 warstwy**: API route (`generate.ts`) → monolit generowania (domena + Supabase + SDK w jednym pliku) → testy integracyjne (mock modułów `ai`/`@openrouter`, nie portu domenowego). Granica: `MealCandidatePort` → `OpenRouterMealCandidateAdapter` (jedyne miejsce z importem SDK po refaktorze).

## 6. Decyzje, które należą do mnie

Badanie całego huba, zaproponowane przez agenta, zawęziłam do filtrów LINQ — najcieńszego kanału przez P0 — ponieważ legacy i BSON to odrębne ścieżki bez wspólnej metody analizy. Odrzuciłam zaproponowany przez agenta inwazyjny wariant C1 (Common.csproj) na rzecz autodetekcji w deptree, uzyskując ten sam wgląd w sprzężenia bez modyfikacji struktury builda. Samodzielnie nadałam priorytet niezmiennikowi INV-TIME-001 nad wskazanym przez agenta INV-PANTRY-001, gdyż jako jedyny nie posiadał żadnej egzekucji serwerowej. Zakres ACL, zaproponowanego przez agenta dla AI SDK i Supabase, ograniczyłam wyłącznie do AI SDK, uznając wymianę modelu za priorytet, a Supabase za zbyt głęboki fundament stosu na tym etapie.
