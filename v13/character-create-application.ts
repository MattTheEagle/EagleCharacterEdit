import { submitCharacterCreate, type CharacterCreateOutcome, type FlightControlRequester, type OperationStore } from "../core/character-create";

const { ApplicationV2 } = foundry.applications.api;

export interface CharacterCreateApplicationContext {
  api(): FlightControlRequester | undefined;
  store(): OperationStore;
  newId(): string;
  text(key: string): string;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusKey(outcome: CharacterCreateOutcome): string {
  switch (outcome.status) {
    case "created": return outcome.created ? "EAGLECHARACTEREDIT.create.created" : "EAGLECHARACTEREDIT.create.retried";
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

    protected override async _renderHTML(): Promise<HTMLElement> {
      const root = element("form");
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
      this.#busy = true;
      await this.render();
      const api = context.api();
      const outcome = api
        ? await submitCharacterCreate(api, context.store(), context.newId, name)
        : ({ status: "request-failed" } as const);
      this.#status = context.text(statusKey(outcome));
      this.#busy = false;
      await this.render();
    }
  };
}
