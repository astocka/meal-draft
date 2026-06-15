# Raport architektoniczny — moduł 4

Zwięzły two-pager z artefaktów L2–L5. Dwa repozytoria — bez domysłów poza źródłami.

**Źródła wejść**

| Poziom | Repozytorium    | Plik                                                                                                            |
| ------ | --------------- | --------------------------------------------------------------------------------------------------------------- |
| L2     | semantic-kernel | `context/map/repo-map.md`                                                                                       |
| L3     | semantic-kernel | `context/changes/mevd-filter-translation/research.md`                                                           |
| L4     | semantic-kernel | `context/changes/refactor-opportunities/plan.md`                                                                |
| L5     | meal-draft      | `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md` |

---

## 1. Opisane projekty

**semantic-kernel** — SDK AI (.NET/Python): mapa (L2), feature (L3), refaktor (L4).
**meal-draft** — spiżarnia → jedna propozycja posiłku: DDD (L5). Core meal-draft wdrożony; SK — ryzyko w hubie kontraktów Vector Data.

---

## 2. Mapa projektu (L2 — semantic-kernel)

**Kontekst:** Wspólne kontrakty wektorowe dla adapterów — gdzie dotknąć kodu bez łamania ekosystemu. _P0_ = top ryzyko; _compile-link_ = współdzielony plik między projektami.

**Kluczowe wnioski z mapy repozytorium:**

1. **Strefy ryzyka (P0):** hub abstrakcji + providerzy; testy integracyjne (churn pakietów).
2. **Lokalne centra:** builder modelu, rdzeń SK, testy zgodności (conformance).
3. **Entry pointy (pierwszy dzień w kodzie):** translator filtrów → builder → provider → testy.
4. **Ukryte sprzężenia:** compile-linki poza grafem MSBuild; legacy omija hub.
5. **Unknowns:** Python, fan-out integracji.

Slice w hubie, nie cała flota.

---

## 3. Analiza ficzera (L3 — semantic-kernel)

**Kontekst:** Filtr LINQ → SQL/OData/BSON — najcieńszy przepływ przez hub abstrakcji.

**Wybrany przepływ:** filtr → model → translator → predykat (zapis bez translatorów).

**Feature overview:** Wiele `new` translatorów bez fabryki; SQL przez compile-link; Chroma/Milvus bez translacji.

**Technical debt (top 3):**

| Ryzyko                | Skutek                       |
| --------------------- | ---------------------------- |
| **Promień kontraktu** | 1 poprawka → 8–11 providerów |
| **Luka testowa**      | Brak unit testów bazy        |
| **Compile-linki**     | SQL niewidoczny w grafie     |

---

## 4. Plan refaktoryzacji (L4 — semantic-kernel)

**Kontekst:** Wąski plan przed kolejną zmianą bazy translatora.

**Co refaktoryzowane (wybrana opcja):** compile-linki w _deptree_ + 5–8 smoke testów. **Czego świadomie NIE robimy:** BSON, fabryka, legacy, pełne pokrycie.

**Fazy (jedna linia + weryfikacja):**

| Faza                        | Weryfikacja                      |
| --------------------------- | -------------------------------- |
| **1. Smoke testy**          | `dotnet test`, regresja PgVector |
| **2. Deptree compile-link** | Węzeł SQL; zero diff builda      |

---

## 5. Domena wg DDD (L5 — meal-draft)

**Kontekst:** Jedna propozycja z twardą spiżarnią i limitem czasu — model docelowy.

### Ubiquitous language (3–5 pojęć)

Strict Pantry, Propozycja posiłku, Sesja generowania, no_match (HTTP 200), Podstawy kuchenne (allowlist soli/oleju).

**Najważniejsze rozjazdy model ↔ kod:** podstawy kuchenne vs PRD; czas tylko w prompcie (HTTP 200 mimo 45 min przy limicie 15); wykluczenia sesji bez walidacji serwerowej.

### Niezmiennik #1 i agregat

**INV-TIME-001** + **`ConstrainedMealProposal`**. Jedyny guardrail bez walidacji serwerowej.

### Anti-Corruption Layer

Przeciek **AI SDK + OpenRouter** w monolicie. Granica: **`MealCandidatePort`** → **`OpenRouterMealCandidateAdapter`**.

---

## 6. Decyzje, które należą do mnie

### Obszar semantic-kernel (L3/L4)

**Zawężenie zakresu (Scope):** Tłumaczenie filtrów, nie cała flota. Odkładam legacy i BSON.

**Modyfikacja wariantu C1 (autodetekcja zamiast .csproj):** Common.csproj odrzucone; autodetekcja compile-linków — graf pokazuje, nie naprawia.

**Głębokość testów:** 5–8 smoke testów wystarczy; pełne pokrycie przedwczesne.

### Obszar meal-draft (L5)

**Priorytet niezmiennika INV-TIME-001:** Najpierw czas — fałszywy sukces w historii.

**Strategia izolacji LLM:** ACL na OpenRouter; Workers AI później za portem.

**Pragmatyka „Strict Pantry”:** `COOKING_STAPLES` akceptowane mimo literalności PRD.
