import type { FlightControlRequester, OperationStore } from "../core/character-create";
import {
  runCharacterCreateFlow,
  type CharacterCreateFlowOutcome,
  type CharacterReadEntry,
} from "../core/character-create-flow";

const { ApplicationV2 } = foundry.applications.api;

export interface CharacterCreateApplicationContext {
  api(): FlightControlRequester | undefined;
  store(): OperationStore;
  newId(): string;
  openCharacter(actorId: string, entry: Exclude<CharacterReadEntry, "sheet">): Promise<boolean>;
  notify(level: "info" | "warn", key: string): void;
  onClose(application: CharacterCreateApplicationHandle): void;
  text(key: string): string;
}

export interface CharacterCreateApplicationHandle {
  render(options?: boolean): Promise<unknown>;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusKey(outcome: CharacterCreateFlowOutcome): string {
  switch (outcome.status) {
    case "created": return "EAGLECHARACTEREDIT.create.confirmedResumable";
    case "invalid-name": return "EAGLECHARACTEREDIT.create.invalidName";
    case "storage-unavailable": return "EAGLECHARACTEREDIT.create.storageUnavailable";
    case "pending-name-mismatch": return "EAGLECHARACTEREDIT.create.pendingNameMismatch";
    case "request-failed": return "EAGLECHARACTEREDIT.create.requestFailed";
  }
}

export function createCharacterCreateApplicationClass(context: CharacterCreateApplicationContext) {
  return class EagleCharacterCreateApplication extends ApplicationV2 {
    static override DEFAULT_OPTIONS = {
      id: "eagle-character-edit-create",
      window: { title: "EAGLECHARACTEREDIT.create.title", icon: "fa-solid fa-user-plus", contentClasses: ["standard-form"] },
      position: { width: 440 },
    };

    #busy = false;
    #status: string | undefined;
    #confirmed: Extract<CharacterCreateFlowOutcome, { readonly status: "created" }> | undefined;
    #viewToken = 0;

    protected override async _renderHTML(): Promise<HTMLElement> {
      const root = element("form");
      if (this.#confirmed) {
        root.append(element("p", this.#status ?? context.text("EAGLECHARACTEREDIT.create.confirmedResumable")));
        const retryOpen = element("button", context.text("EAGLECHARACTEREDIT.create.retryOpen"));
        retryOpen.type = "button";
        retryOpen.dataset.action = "retry-open";
        retryOpen.disabled = this.#busy;
        root.append(retryOpen);
        return root;
      }

      const pending = context.store().load();
      const input = element("input") as HTMLInputElement;
      input.name = "name";
      input.type = "text";
      input.maxLength = 200;
      input.required = true;
      input.value = pending?.name ?? "";
      input.disabled = this.#busy || pending !== undefined;

      const label = element("label", context.text("EAGLECHARACTEREDIT.create.name"));
      label.htmlFor = "eagle-character-edit-name";
      input.id = label.htmlFor;
      root.append(label, input);
      if (pending) root.append(element("p", context.text("EAGLECHARACTEREDIT.create.retryHint")));
      if (this.#status) root.append(element("p", this.#status));

      const button = element("button", context.text(pending ? "EAGLECHARACTEREDIT.create.retry" : "EAGLECHARACTEREDIT.create.submit"));
      button.type = "submit";
      button.disabled = this.#busy;
      root.append(button);
      return root;
    }

    protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
      content.replaceChildren(result);
    }

    protected override async _onRender(): Promise<void> {
      const retryOpen = this.element.querySelector<HTMLButtonElement>('button[data-action="retry-open"]');
      if (retryOpen) {
        retryOpen.addEventListener("click", () => void this.#retryOpen());
        return;
      }
      const form = this.element.querySelector("form");
      const input = this.element.querySelector<HTMLInputElement>('input[name="name"]');
      if (!form || !input) return;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.#submit(input.value);
      });
    }

    async #submit(name: string): Promise<void> {
      if (this.#busy) return;
      const token = this.#viewToken;
      this.#busy = true;
      await this.render();
      if (token !== this.#viewToken) {
        this.#busy = false;
        return;
      }

      const outcome = await runCharacterCreateFlow({
        api: context.api(),
        store: context.store(),
        newId: context.newId,
        isActive: () => token === this.#viewToken,
        open: context.openCharacter,
      }, name);
      this.#busy = false;

      if (token !== this.#viewToken) {
        if (outcome.status === "created") context.notify("info", "EAGLECHARACTEREDIT.create.closedConfirmed");
        else if (outcome.status === "request-failed") context.notify("warn", "EAGLECHARACTEREDIT.create.closedUnknown");
        return;
      }

      if (outcome.status === "created" && outcome.transition === "opened") {
        await this.close();
        return;
      }
      if (outcome.status === "created") this.#confirmed = outcome;
      this.#status = context.text(statusKey(outcome));
      await this.render();
    }

    async #retryOpen(): Promise<void> {
      if (this.#busy || !this.#confirmed) return;
      const token = this.#viewToken;
      const confirmed = this.#confirmed;
      this.#busy = true;
      await this.render();
      if (token !== this.#viewToken) {
        this.#busy = false;
        return;
      }

      let opened = false;
      try {
        opened = await context.openCharacter(confirmed.id, confirmed.created ? "created" : "retried");
      } catch {
        opened = false;
      }
      this.#busy = false;
      if (token !== this.#viewToken) return;
      if (opened) {
        await this.close();
        return;
      }
      this.#status = context.text("EAGLECHARACTEREDIT.create.confirmedResumable");
      await this.render();
    }

    protected override _onClose(): void {
      this.#viewToken += 1;
      context.onClose(this);
    }
  };
}
