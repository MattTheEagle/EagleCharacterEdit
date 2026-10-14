import type { CharacterReadModel } from "../core/character-read";
import type { CharacterReadEntry } from "../core/character-create-flow";

const { ApplicationV2 } = foundry.applications.api;

export interface CharacterReadApplicationContext {
  read(actorId: string): CharacterReadModel | undefined;
  observe(actorId: string, refresh: () => void): () => void;
  text(key: string): string;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
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
  return class EagleCharacterReadApplication extends ApplicationV2 {
    static override DEFAULT_OPTIONS = {
      id: "eagle-character-edit-read",
      window: { title: "EAGLECHARACTEREDIT.read.title", icon: "fa-solid fa-eye", contentClasses: ["standard-form"] },
      position: { width: 520 },
    };

    #actorId: string;
    #entry: CharacterReadEntry;
    #unsubscribe: (() => void) | undefined;

    constructor(actorId: string, entry: CharacterReadEntry = "sheet") {
      super();
      this.#actorId = actorId;
      this.#entry = entry;
    }

    protected override async _renderHTML(): Promise<HTMLElement> {
      const root = element("section");
      const model = context.read(this.#actorId);
      if (!model) {
        root.append(element("p", context.text("EAGLECHARACTEREDIT.read.unavailable")));
        return root;
      }
      root.append(element("h2", model.name));
      if (this.#entry === "created") root.append(element("p", context.text("EAGLECHARACTEREDIT.read.created")));
      if (this.#entry === "retried") root.append(element("p", context.text("EAGLECHARACTEREDIT.read.retried")));
      root.append(element("p", context.text("EAGLECHARACTEREDIT.read.readOnly")));
      root.append(element("h3", context.text("EAGLECHARACTEREDIT.read.items")));
      root.append(itemSummary(model, context.text));
      return root;
    }

    protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
      content.replaceChildren(result);
    }

    protected override async _onFirstRender(): Promise<void> {
      this.#unsubscribe = context.observe(this.#actorId, () => void this.render());
    }

    protected override _onClose(): void {
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
    }
  };
}
