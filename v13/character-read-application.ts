import {
  ATTRIBUTE_METHODS,
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  SCORE_LIMIT,
  STANDARD_ARRAY,
  inferMethod,
  pointBuySpent,
  switchMethod,
  validateBases,
  type AttributeMethod,
  type DraftBases,
  type RuleViolation,
} from "../core/ability-rules";
import { attributeChange, baselineChanged, pendingInput, pendingRelation, reactionTo } from "../core/attribute-edit";
import { buildAttributeModel, valuesOf, type AbilityScore, type AttributeModel } from "../core/attributes";
import type { FlightControlRequester } from "../core/character-create";
import type { CharacterReadEntry } from "../core/character-create-flow";
import type { CharacterReadModel } from "../core/character-read";
import {
  ABILITY_KEYS,
  submitCharacterUpdate,
  type AbilityKey,
  type CharacterUpdateInput,
  type CharacterUpdateOutcome,
  type CharacterUpdateStore,
  type PendingCharacterUpdate,
} from "../core/character-update";

const { ApplicationV2 } = foundry.applications.api;
const fields = foundry.applications.fields;

type Tab = foundry.applications.api.ApplicationV2.Tab;

const TAB_GROUP = "sheet";
const TAB_IDS = ["overview", "attributes"] as const;
// Foundry core template that renders the tab navigation for the tabs returned by _prepareTabs (UI guide R-04).
const NAV_TEMPLATE = "templates/generic/tab-navigation.hbs";
// The keys are written out so that a search for a language key finds its use.
const METHOD_KEYS: Readonly<Record<AttributeMethod, { label: string; hint: string }>> = {
  "point-buy": { label: "EAGLECHARACTEREDIT.attributes.methods.pointBuy", hint: "EAGLECHARACTEREDIT.attributes.methodHints.pointBuy" },
  "standard-array": { label: "EAGLECHARACTEREDIT.attributes.methods.standardArray", hint: "EAGLECHARACTEREDIT.attributes.methodHints.standardArray" },
  manual: { label: "EAGLECHARACTEREDIT.attributes.methods.manual", hint: "EAGLECHARACTEREDIT.attributes.methodHints.manual" },
};

export interface CharacterUpdateContext {
  api(): FlightControlRequester | undefined;
  store(): CharacterUpdateStore;
  newId(): string;
}

export interface CharacterReadApplicationContext {
  read(actorId: string): CharacterReadModel | undefined;
  observe(actorId: string, refresh: () => void): () => void;
  text(key: string, data?: Record<string, string>): string;
  abilityLabel(key: AbilityKey): string;
  notify(level: "info" | "warn", key: string): void;
  updates: CharacterUpdateContext;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, action: string, disabled: boolean): HTMLButtonElement {
  const node = element("button", label);
  node.type = "button";
  node.dataset.action = action;
  node.disabled = disabled;
  return node;
}

function tabSection(id: string, active: boolean): HTMLElement {
  const section = element("section");
  section.classList.add("tab");
  if (active) section.classList.add("active");
  section.dataset.group = TAB_GROUP;
  section.dataset.tab = id;
  return section;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function loadPending(store: CharacterUpdateStore): PendingCharacterUpdate | undefined {
  try {
    return store.load();
  } catch {
    return undefined;
  }
}

function itemSummary(model: CharacterReadModel, text: (key: string) => string): HTMLElement {
  const list = element("ul");
  if (model.items.length === 0) {
    list.append(element("li", text("EAGLECHARACTEREDIT.read.emptyItems")));
    return list;
  }
  for (const item of model.items) {
    const row = element("li");
    row.append(element("strong", item.name));
    row.append(document.createTextNode(` (${item.type}) — ${text("EAGLECHARACTEREDIT.read.preserved")}`));
    row.append(document.createTextNode(item.advancement.present
      ? `; ${text("EAGLECHARACTEREDIT.read.advancementPresent")}`
      : `; ${text("EAGLECHARACTEREDIT.read.advancementAbsent")}`));
    if (item.provenance.state === "library-marker-present") {
      row.append(document.createTextNode(`; ${text("EAGLECHARACTEREDIT.read.libraryMarker")}`));
    }
    list.append(row);
  }
  return list;
}

export function createCharacterReadApplicationClass(context: CharacterReadApplicationContext) {
  const text = context.text;

  function violationText(violation: RuleViolation): string {
    switch (violation.rule) {
      case "point-buy-range":
        return text("EAGLECHARACTEREDIT.attributes.rules.pointBuyRange", { ability: context.abilityLabel(violation.key) });
      case "point-buy-budget":
        return text("EAGLECHARACTEREDIT.attributes.rules.pointBuyBudget", { budget: String(POINT_BUY_BUDGET), spent: String(violation.spent) });
      case "standard-array":
        return text("EAGLECHARACTEREDIT.attributes.rules.standardArray");
      case "manual-range":
        return text("EAGLECHARACTEREDIT.attributes.rules.manualRange", { ability: context.abilityLabel(violation.key) });
      case "total-range":
        return text("EAGLECHARACTEREDIT.attributes.rules.totalRange", { ability: context.abilityLabel(violation.key), limit: String(SCORE_LIMIT) });
    }
  }

  function scoreHint(score: AbilityScore, base: number | null): string {
    const total = base === null ? undefined : base + score.bonus;
    const parts = [text("EAGLECHARACTEREDIT.attributes.hint", { bonus: signed(score.bonus), total: total === undefined ? "—" : String(total) })];
    if (score.final !== undefined && score.final !== score.stored) {
      parts.push(text("EAGLECHARACTEREDIT.attributes.hintEffects", { final: String(score.final) }));
    }
    if (total !== undefined && total > score.max) parts.push(text("EAGLECHARACTEREDIT.attributes.hintAboveMax", { max: String(score.max) }));
    return parts.join(" · ");
  }

  function pendingSummary(pending: PendingCharacterUpdate): string {
    const changes = ABILITY_KEYS
      .filter((key) => pending.abilities[key])
      .map((key) => `${context.abilityLabel(key)} ${pending.abilities[key]!.from} → ${pending.abilities[key]!.to}`)
      .join(", ");
    return text("EAGLECHARACTEREDIT.attributes.pendingValues", { changes });
  }

  return class EagleCharacterReadApplication extends ApplicationV2 {
    static override DEFAULT_OPTIONS = {
      id: "eagle-character-edit-read",
      window: { title: "EAGLECHARACTEREDIT.read.title", icon: "fa-solid fa-user-pen", contentClasses: ["standard-form"] },
      position: { width: 560 },
      actions: {
        saveAttributes: EagleCharacterReadApplication.#onSave,
        resetAttributes: EagleCharacterReadApplication.#onReset,
        retryAttributes: EagleCharacterReadApplication.#onRetry,
        discardAttributes: EagleCharacterReadApplication.#onDiscard,
      },
    };

    #actorId: string;
    #entry: CharacterReadEntry;
    #unsubscribe: (() => void) | undefined;
    #closed = false;
    #busy = false;
    // The editing state lives only in this window. A draft keeps the world state it started on (its baseline), so
    // that a later change on the sheet is answered with a conflict instead of being overwritten.
    #method: AttributeMethod | undefined;
    #draft: DraftBases | undefined;
    #baseline: AttributeModel | undefined;
    // The model and the elements of the last render that a field change updates without rendering again.
    #current: AttributeModel | undefined;
    #hints = new Map<AbilityKey, HTMLElement>();
    #points: HTMLElement | undefined;
    #violation: HTMLElement | undefined;
    #save: HTMLButtonElement | undefined;

    constructor(actorId: string, entry: CharacterReadEntry = "sheet") {
      super();
      this.#actorId = actorId;
      this.#entry = entry;
    }

    static #onSave(this: EagleCharacterReadApplication): void {
      void this.#saveAttributes();
    }

    static #onReset(this: EagleCharacterReadApplication): void {
      if (this.#busy) return;
      this.#resetDraft();
      void this.render();
    }

    static #onRetry(this: EagleCharacterReadApplication): void {
      void this.#retryPending();
    }

    static #onDiscard(this: EagleCharacterReadApplication): void {
      if (this.#busy) return;
      // Safe even if the unconfirmed write was applied: the next write starts from the fresh read of this render and
      // Flight Control compares it with the current revision and scores.
      try { context.updates.store().clear(); } catch { /* the pending block stays visible */ }
      this.#resetDraft();
      void this.render();
    }

    protected override _prepareTabs(group: string): Record<string, Tab> {
      const active = this.tabGroups[group] ?? (this.#entry === "sheet" ? "overview" : "attributes");
      this.tabGroups[group] = active;
      const tabs: Record<string, Tab> = {};
      for (const id of TAB_IDS) {
        const isActive = id === active;
        tabs[id] = { id, group, active: isActive, cssClass: isActive ? "active" : "", label: text(`EAGLECHARACTEREDIT.tabs.${id}`) };
      }
      return tabs;
    }

    protected override async _renderHTML(): Promise<HTMLElement> {
      const root = element("div");
      const model = context.read(this.#actorId);
      this.#hints.clear();
      this.#points = this.#violation = this.#save = undefined;
      if (!model) {
        this.#current = undefined;
        root.append(element("p", text("EAGLECHARACTEREDIT.read.unavailable")));
        return root;
      }
      root.append(element("h2", model.name));
      if (this.#entry === "created") root.append(element("p", text("EAGLECHARACTEREDIT.read.created")));
      if (this.#entry === "retried") root.append(element("p", text("EAGLECHARACTEREDIT.read.retried")));
      const tabs = this._prepareTabs(TAB_GROUP);
      const nav = foundry.utils.parseHTML(await foundry.applications.handlebars.renderTemplate(NAV_TEMPLATE, { tabs }));
      if (nav instanceof HTMLElement) root.append(nav);
      else root.append(...Array.from(nav));
      root.append(this.#renderOverview(model, tabs.overview!.active), this.#renderAttributes(model, tabs.attributes!.active));
      return root;
    }

    protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
      content.replaceChildren(result);
    }

    protected override async _onFirstRender(): Promise<void> {
      this.#unsubscribe = context.observe(this.#actorId, () => void this.render());
    }

    protected override async _onRender(): Promise<void> {
      this.element.querySelector<HTMLSelectElement>("select[data-attribute-method]")
        ?.addEventListener("change", (event) => this.#onMethodChange((event.currentTarget as HTMLSelectElement).value));
      for (const input of this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-attribute-base]")) {
        input.addEventListener("change", () => this.#onBaseChange(input));
      }
    }

    protected override _onClose(): void {
      this.#closed = true;
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
    }

    #renderOverview(model: CharacterReadModel, active: boolean): HTMLElement {
      const section = tabSection("overview", active);
      const items = element("fieldset");
      items.append(element("legend", text("EAGLECHARACTEREDIT.read.items")));
      items.append(element("p", text("EAGLECHARACTEREDIT.read.readOnly")));
      items.append(itemSummary(model, text));
      section.append(items);
      return section;
    }

    #renderAttributes(model: CharacterReadModel, active: boolean): HTMLElement {
      const section = tabSection("attributes", active);
      const current = buildAttributeModel(model);
      this.#current = current;
      if (!current.scores) {
        section.append(element("p", text("EAGLECHARACTEREDIT.attributes.unreadable")));
        return section;
      }
      // Without unsaved changes the window always follows the world state.
      if (!this.#draft) this.#baseline = undefined;
      const baseline = this.#baseline ?? current;
      const saved = valuesOf(baseline.scores!, "base");
      const method = this.#method ?? inferMethod(saved);
      const draft = this.#draft ?? saved;
      const pending = loadPending(context.updates.store());
      const relation = pendingRelation(pending, current.uuid);
      const editable = current.editable && relation === "none" && !this.#busy;

      if (!current.editable) section.append(element("p", text("EAGLECHARACTEREDIT.attributes.unreadable")));
      if (pending && relation !== "none") section.append(this.#renderPending(pending, relation === "this"));
      if (this.#draft && baselineChanged(baseline, current)) {
        section.append(element("p", text("EAGLECHARACTEREDIT.attributes.changedElsewhere")));
      }

      const methodSelect = fields.createSelectInput({
        name: "method",
        value: method,
        options: ATTRIBUTE_METHODS.map((value) => ({ value, label: text(METHOD_KEYS[value].label) })),
        disabled: !editable,
        dataset: { attributeMethod: "true" },
      });
      section.append(fields.createFormGroup({
        label: text("EAGLECHARACTEREDIT.attributes.method"),
        hint: text(METHOD_KEYS[method].hint),
        input: methodSelect,
      }));

      const scores = element("fieldset");
      scores.append(element("legend", text("EAGLECHARACTEREDIT.attributes.scores")));
      scores.append(element("p", text("EAGLECHARACTEREDIT.attributes.explanation")));
      for (const key of ABILITY_KEYS) {
        const score = baseline.scores![key];
        const group = fields.createFormGroup({
          label: context.abilityLabel(key),
          hint: scoreHint(score, draft[key]),
          input: this.#baseInput(key, method, draft[key], !editable),
        });
        const hint = group.querySelector<HTMLElement>(".hint") ?? group.appendChild(element("p"));
        this.#hints.set(key, hint);
        scores.append(group);
      }
      section.append(scores);

      if (method === "point-buy") {
        this.#points = element("p");
        section.append(this.#points);
      }
      this.#violation = element("p");
      section.append(this.#violation);

      const buttons = element("div");
      this.#save = button(text(this.#busy ? "EAGLECHARACTEREDIT.attributes.saving" : "EAGLECHARACTEREDIT.attributes.save"), "saveAttributes", true);
      buttons.append(this.#save, button(text("EAGLECHARACTEREDIT.attributes.reset"), "resetAttributes", !editable || !this.#draft));
      section.append(buttons);
      this.#refreshSummary(editable);
      return section;
    }

    #renderPending(pending: PendingCharacterUpdate, ownCharacter: boolean): HTMLElement {
      const block = element("fieldset");
      block.append(element("legend", text("EAGLECHARACTEREDIT.attributes.pendingTitle")));
      block.append(element("p", text(ownCharacter ? "EAGLECHARACTEREDIT.attributes.pendingThis" : "EAGLECHARACTEREDIT.attributes.pendingOther")));
      if (ownCharacter) {
        block.append(element("p", pendingSummary(pending)));
        block.append(button(text("EAGLECHARACTEREDIT.attributes.retry"), "retryAttributes", this.#busy));
      }
      block.append(button(text("EAGLECHARACTEREDIT.attributes.discard"), "discardAttributes", this.#busy));
      return block;
    }

    #baseInput(key: AbilityKey, method: AttributeMethod, value: number | null, disabled: boolean): HTMLElement {
      const common = { name: `base.${key}`, disabled, dataset: { attributeBase: key } };
      if (method === "standard-array") {
        return fields.createSelectInput({
          ...common,
          value: value === null ? "" : String(value),
          options: [
            { value: "", label: text("EAGLECHARACTEREDIT.attributes.unassigned") },
            ...STANDARD_ARRAY.map((score) => ({ value: String(score), label: String(score) })),
          ],
        });
      }
      const range = method === "point-buy" ? { min: POINT_BUY_MIN, max: POINT_BUY_MAX } : { min: 1, max: SCORE_LIMIT };
      return fields.createNumberInput({ ...common, value: value ?? undefined, step: 1, ...range });
    }

    // Updates hints, points, rule message and the save button after a field change, without rendering again so the
    // focus stays where the user moved it.
    #refreshSummary(editable: boolean): void {
      const current = this.#current;
      const baseline = this.#baseline ?? current;
      if (!baseline?.scores) return;
      const saved = valuesOf(baseline.scores, "base");
      const method = this.#method ?? inferMethod(saved);
      const draft = this.#draft ?? saved;
      for (const key of ABILITY_KEYS) {
        const hint = this.#hints.get(key);
        if (hint) hint.textContent = scoreHint(baseline.scores[key], draft[key]);
      }
      if (this.#points) {
        const spent = pointBuySpent(draft);
        this.#points.textContent = spent === undefined
          ? text("EAGLECHARACTEREDIT.attributes.pointsInvalid")
          : text("EAGLECHARACTEREDIT.attributes.points", {
            spent: String(spent), budget: String(POINT_BUY_BUDGET), remaining: String(POINT_BUY_BUDGET - spent),
          });
      }
      const violation = validateBases(method, draft, valuesOf(baseline.scores, "bonus"));
      if (this.#violation) this.#violation.textContent = violation && this.#draft ? violationText(violation) : "";
      if (this.#save) this.#save.disabled = !editable || attributeChange(baseline, method, draft).status !== "change";
    }

    #startDraft(): DraftBases | undefined {
      const current = this.#current;
      if (!current?.scores || this.#busy) return undefined;
      this.#baseline ??= current;
      return this.#draft ?? valuesOf(this.#baseline.scores!, "base");
    }

    #onMethodChange(value: string): void {
      const method = ATTRIBUTE_METHODS.find((candidate) => candidate === value);
      const draft = this.#startDraft();
      if (!method || !draft) return;
      this.#method = method;
      this.#draft = switchMethod(method, draft, valuesOf(this.#baseline!.scores!, "base"));
      void this.render();
    }

    #onBaseChange(input: HTMLInputElement | HTMLSelectElement): void {
      const key = ABILITY_KEYS.find((candidate) => candidate === input.dataset.attributeBase);
      const draft = this.#startDraft();
      if (!key || !draft) return;
      const raw = input.value.trim();
      const value = raw === "" ? null : Number(raw);
      this.#method ??= inferMethod(valuesOf(this.#baseline!.scores!, "base"));
      this.#draft = { ...draft, [key]: value !== null && Number.isFinite(value) ? value : null };
      this.#refreshSummary(true);
      const reset = this.element.querySelector<HTMLButtonElement>("button[data-action=resetAttributes]");
      if (reset) reset.disabled = false;
    }

    #resetDraft(): void {
      this.#method = undefined;
      this.#draft = undefined;
      this.#baseline = undefined;
    }

    async #saveAttributes(): Promise<void> {
      const baseline = this.#baseline ?? this.#current;
      if (this.#busy || !baseline?.scores || !this.#draft) return;
      const method = this.#method ?? inferMethod(valuesOf(baseline.scores, "base"));
      const change = attributeChange(baseline, method, this.#draft);
      if (change.status !== "change") {
        void this.render();
        return;
      }
      const store = context.updates.store();
      if (pendingRelation(loadPending(store), baseline.uuid) !== "none") {
        void this.render();
        return;
      }
      await this.#submit(store, change.input);
    }

    async #retryPending(): Promise<void> {
      if (this.#busy) return;
      const store = context.updates.store();
      const pending = loadPending(store);
      if (!pending || pendingRelation(pending, this.#current?.uuid) !== "this") {
        void this.render();
        return;
      }
      await this.#submit(store, pendingInput(pending));
    }

    async #submit(store: CharacterUpdateStore, input: CharacterUpdateInput): Promise<void> {
      const api = context.updates.api();
      if (!api) {
        context.notify("warn", "EAGLECHARACTEREDIT.attributes.failed");
        return;
      }
      this.#busy = true;
      void this.render();
      let outcome: CharacterUpdateOutcome;
      try {
        outcome = await submitCharacterUpdate(api, store, () => context.updates.newId(), input);
      } catch {
        outcome = { status: "unknown" };
      } finally {
        this.#busy = false;
      }
      const reaction = reactionTo(outcome);
      if (reaction.discardDraft) this.#resetDraft();
      // A conflict is kept by the adapter until the editor reads again; the render below is that fresh read, and the
      // next write is built from it with a new operation id.
      if (reaction.clearStore) {
        try { store.clear(); } catch { /* the pending block then offers Discard */ }
      }
      context.notify(reaction.level, reaction.key);
      if (!this.#closed) void this.render();
    }
  };
}
