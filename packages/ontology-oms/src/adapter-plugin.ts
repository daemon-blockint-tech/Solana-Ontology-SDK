/**
 * Optional external sync adapter plugin.
 * Any external system can implement this to sync our ontology definitions.
 */

import type {
  ExternalAdapter,
  ObjectTypeDefinition,
  LinkTypeDefinition,
  ActionTypeDefinition,
} from "../types.js";

/**
 * Null adapter — no-op default.
 */
export class NullAdapter implements ExternalAdapter {
  name = "null";
  async syncObjectTypes(_types: ObjectTypeDefinition[]): Promise<void> {}
  async syncLinkTypes(_types: LinkTypeDefinition[]): Promise<void> {}
  async syncActionTypes(_types: ActionTypeDefinition[]): Promise<void> {}
}

/**
 * Webhook adapter — pushes type definitions to an external HTTP endpoint.
 */
export class WebhookAdapter implements ExternalAdapter {
  name: string;
  private url: string;
  private authToken: string;

  constructor(config: { name: string; url: string; authToken: string }) {
    this.name = config.name;
    this.url = config.url;
    this.authToken = config.authToken;
  }

  async syncObjectTypes(types: ObjectTypeDefinition[]): Promise<void> {
    await this.post("object-types", types);
  }

  async syncLinkTypes(types: LinkTypeDefinition[]): Promise<void> {
    await this.post("link-types", types);
  }

  async syncActionTypes(types: ActionTypeDefinition[]): Promise<void> {
    await this.post("action-types", types);
  }

  private async post(endpoint: string, body: unknown): Promise<void> {
    await fetch(`${this.url}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(body),
    });
  }
}
